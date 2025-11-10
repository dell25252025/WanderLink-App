
import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
// Correct the import for algoliasearch to include the SearchClient type
import algoliasearch, { type SearchClient } from "algoliasearch";
import * as logger from "firebase-functions/logger";

// Import v2 functions
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";

// Define parameters for environment variables
import { defineString } from "firebase-functions/params";
const ALGOLIA_APP_ID = defineString("ALGOLIA_APP_ID");
const ALGOLIA_ADMIN_KEY = defineString("ALGOLIA_ADMIN_KEY");
const ALGOLIA_SEARCH_KEY = defineString("ALGOLIA_SEARCH_KEY");


admin.initializeApp();

// Initialize Algolia client lazily
// Use the imported SearchClient type correctly
let algoliaClient: SearchClient | null = null;
const getAlgoliaClient = (): SearchClient => {
    if (!algoliaClient) {
        const appId = ALGOLIA_APP_ID.value();
        const adminKey = ALGOLIA_ADMIN_KEY.value();
        if (!appId || !adminKey) {
            logger.error("Algolia App ID or Admin Key is not configured.");
            throw new Error("Algolia configuration is missing.");
        }
        algoliaClient = algoliasearch(appId, adminKey);
    }
    return algoliaClient;
};

const visionClient = new ImageAnnotatorClient();

// This single function handles creations, updates, and deletions.
export const syncUserToAlgolia = onDocumentWritten("users/{userId}", async (event) => {
    const objectID = event.params.userId;
    // Get the index from the correctly initialized client
    const usersIndex = getAlgoliaClient().initIndex("users");

    // If the document does not exist, it has been deleted.
    if (!event.data?.after.exists) {
        try {
            await usersIndex.deleteObject(objectID);
            logger.log(`User ${objectID} deleted from Algolia.`);
        } catch (error) {
            logger.error(`Error deleting user ${objectID} from Algolia:`, error);
        }
        return;
    }

    const newData = event.data.after.data();

    if (!newData) {
        logger.warn(`No data found for user ${objectID} on write event.`);
        return;
    }

    // We don't want to index sensitive data.
    const { privateData, email, ...rest } = newData;

    const algoliaRecord: any = {
        objectID,
        ...rest,
    };

    // Add geolocation data for proximity search.
    if (newData.latitude && newData.longitude) {
        algoliaRecord._geoloc = {
            lat: newData.latitude,
            lng: newData.longitude,
        };
    }

    try {
        await usersIndex.saveObject(algoliaRecord);
        logger.log(`User ${objectID} indexed in Algolia.`);
    } catch (error) {
        logger.error(`Error indexing user ${objectID} in Algolia:`, error);
    }
});

// This function securely provides the frontend with the keys it needs.
export const getAlgoliaConfig = onCall((request) => {
  const appId = ALGOLIA_APP_ID.value();
  const searchKey = ALGOLIA_SEARCH_KEY.value();

  if (!appId || !searchKey) {
      throw new HttpsError('internal', 'Algolia configuration is missing on the server.');
  }

  return {
    appId: appId,
    searchKey: searchKey,
  };
});


/**
 * Triggered when a new image is uploaded to the profilePictures/ directory.
 * It uses the Google Cloud Vision API to detect inappropriate content.
 * If the image is flagged as adult or violent, it is deleted from Storage.
 */
export const moderateProfilePicture = onObjectFinalized(async (event) => {
    const object = event.data;
    
    // We only want to moderate images in the profilePictures folder.
    if (!object.name?.startsWith("profilePictures/")) {
        logger.log(`File ${object.name} is not a profile picture. Ignoring.`);
        return null;
    }
    // Ignore folder creation events and non-image files.
    if (object.contentType?.endsWith("/") || !object.contentType?.startsWith("image/")) {
        logger.log(`File ${object.name} is a folder or not an image. Ignoring.`);
        return null;
    }

    const bucketName = object.bucket;
    const filePath = object.name;
    const gcsUri = `gs://${bucketName}/${filePath}`;

    try {
      const [result] = await visionClient.safeSearchDetection(gcsUri);
      const safeSearch = result.safeSearchAnnotation;

      if (!safeSearch) {
        logger.log(`No safe search annotation for ${filePath}.`);
        return null;
      }

      const isAdult = safeSearch.adult === "LIKELY" || safeSearch.adult === "VERY_LIKELY";
      const isViolent = safeSearch.violence === "LIKELY" || safeSearch.violence === "VERY_LIKELY";

      if (isAdult || isViolent) {
        logger.warn(`Inappropriate image detected: ${filePath}. Deleting...`);
        const bucket = admin.storage().bucket(bucketName);
        await bucket.file(filePath).delete();
      } else {
        logger.log(`Image ${filePath} is clean.`);
      }
      return null;
    } catch (error) {
      logger.error(`Error analyzing image ${filePath}:`, error);
      return null;
    }
});
