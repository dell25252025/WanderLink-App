
import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
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

// Lazily initialize clients to avoid timeout issues on cold start
let algoliaClient: SearchClient | null = null;
let visionClient: ImageAnnotatorClient | null = null;

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

const getVisionClient = (): ImageAnnotatorClient => {
    if (!visionClient) {
        visionClient = new ImageAnnotatorClient();
    }
    return visionClient;
};


// This function handles creations, updates, and deletions.
export const syncUserToAlgolia = onDocumentWritten("users/{userId}", async (event) => {
    const objectID = event.params.userId;
    const usersIndex = getAlgoliaClient().initIndex("users");

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

    const { privateData, email, ...rest } = newData;
    const algoliaRecord: any = { objectID, ...rest };

    if (newData.latitude && newData.longitude) {
        algoliaRecord._geoloc = { lat: newData.latitude, lng: newData.longitude };
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

  return { appId: appId, searchKey: searchKey };
});


/**
 * Triggered when a new image is uploaded, moderates it using Google Cloud Vision API.
 */
export const moderateProfilePicture = onObjectFinalized(async (event) => {
    const { bucket, name, contentType } = event.data;

    if (!name?.startsWith("profilePictures/") || contentType?.endsWith("/") || !contentType?.startsWith("image/")) {
        logger.log(`File ${name} is not an image in profilePictures/ folder. Ignoring.`);
        return null;
    }

    const gcsUri = `gs://${bucket}/${name}`;

    try {
      const vision = getVisionClient();
      const [result] = await vision.safeSearchDetection(gcsUri);
      const safeSearch = result.safeSearchAnnotation;

      if (!safeSearch) {
        logger.log(`No safe search annotation for ${name}.`);
        return null;
      }

      const isAdult = safeSearch.adult === "LIKELY" || safeSearch.adult === "VERY_LIKELY";
      const isViolent = safeSearch.violence === "LIKELY" || safeSearch.violence === "VERY_LIKELY";

      if (isAdult || isViolent) {
        logger.warn(`Inappropriate image detected: ${name}. Deleting...`);
        const storageBucket = admin.storage().bucket(bucket);
        await storageBucket.file(name).delete();
      } else {
        logger.log(`Image ${name} is clean.`);
      }
      return null;
    } catch (error) {
      logger.error(`Error analyzing image ${name}:`, error);
      return null;
    }
});
