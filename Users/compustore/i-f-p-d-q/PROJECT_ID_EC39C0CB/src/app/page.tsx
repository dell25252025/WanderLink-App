'use client';

import { Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getAllUsers, getUserProfile } from '@/lib/firebase-actions';
import BottomNav from '@/components/bottom-nav';
import WanderlinkHeader from '@/components/wanderlink-header';
import { useToast } from '@/hooks/use-toast';
import type { DocumentData } from 'firebase/firestore';
import type { UserProfile } from '@/lib/schema';
import ProfileCard from '@/components/profile-card';
import IncomingCallManager from '@/components/incoming-call-manager';

// --- Sub-component for Authenticated Users --- //

function DiscoverPage({ user }: { user: User }) {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [currentUserProfile, setCurrentUserProfile] = useState<DocumentData | null>(null);
  const [allUsers, setAllUsers] = useState<DocumentData[]>([]);
  const [displayMatches, setDisplayMatches] = useState<DocumentData[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  useEffect(() => {
    async function fetchProfiles() {
      try {
        setProfilesLoading(true);
        // Check for search results in localStorage
        const searchResultsJSON = localStorage.getItem('searchResults');
        const searchTimestamp = localStorage.getItem('searchTimestamp');
        
        // Clear old search results after 5 minutes
        if (searchTimestamp && Date.now() - parseInt(searchTimestamp, 10) > 5 * 60 * 1000) {
            localStorage.removeItem('searchResults');
            localStorage.removeItem('searchTimestamp');
        }

        if (searchResultsJSON) {
            const searchResults = JSON.parse(searchResultsJSON);
            setDisplayMatches(searchResults);
            // Optionally, clear the stored results so they aren't shown on next visit
            localStorage.removeItem('searchResults');
            localStorage.removeItem('searchTimestamp');

        } else {
            // No search results, fetch default users
            const [userProfile, users] = await Promise.all([
              getUserProfile(user.uid),
              getAllUsers(12), // Fetch a limited number of users
            ]);
            setCurrentUserProfile(userProfile);
            const otherUsers = users.filter(u => u.id !== user.uid);
            setAllUsers(otherUsers);
            setDisplayMatches(otherUsers);
        }

      } catch (error) {
        console.error("Failed to fetch profiles:", error);
        toast({ variant: 'destructive', title: 'Error fetching profiles' });
      } finally {
        setProfilesLoading(false);
      }
    }
    fetchProfiles();
  }, [user, toast]);
  

  const getMappedProfiles = (profiles: DocumentData[]): UserProfile[] => {
      return profiles.map(p => ({
        id: p.id,
        name: p.firstName,
        age: p.age,
        gender: p.gender,
        bio: p.bio,
        location: p.location || 'N/A',
        travelStyle: p.travelStyle || 'Tous',
        dreamDestinations: [p.destination] || ['Toutes'],
        languagesSpoken: p.languages || [],
        travelIntention: p.intention || '50/50',
        verified: p.isVerified ?? false,
        isVerified: p.isVerified ?? false,
        image: p.profilePictures?.[0] || `https://picsum.photos/seed/${p.id}/800/1200`
    }));
  }

  const mappedProfiles = getMappedProfiles(displayMatches);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <WanderlinkHeader />
      <IncomingCallManager />
      <main className="flex-1 pb-24 pt-10 md:pt-12">
        <div className="container mx-auto max-w-7xl px-2">
          <div className="text-center">
            {profilesLoading ? (
              <div className="flex flex-col items-center justify-center text-center h-96">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <h2 className="mt-6 text-2xl font-semibold">Chargement des profils...</h2>
              </div>
            ) : (
              <>
                
                <div className="mt-0">
                   {displayMatches.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
                      {mappedProfiles.map((profile) => (
                        <ProfileCard key={profile.id} profile={profile} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-8">Aucun profil ne correspond à votre recherche.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}


// --- Main Component --- //

function ConditionalHome() {
  const [currentUserAuth, setCurrentUserAuth] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserAuth(user);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Redirect only when authentication check is complete and user is not logged in.
    if (!loadingAuth && !currentUserAuth) {
      router.push('/login');
    }
  }, [loadingAuth, currentUserAuth, router]);

  if (loadingAuth) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (currentUserAuth) {
    return (
      <Suspense fallback={<div className="flex h-screen w-full flex-col items-center justify-center bg-background"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>}>
        <DiscoverPage user={currentUserAuth} />
      </Suspense>
    );
  }
  
  // Return a loader while redirecting to prevent rendering anything else
  return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
  );
}

export default ConditionalHome;
