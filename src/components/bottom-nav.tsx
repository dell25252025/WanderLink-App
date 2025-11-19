
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Compass, Users, MessageSquare, User, UserPlus, Settings } from 'lucide-react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase'; // MODIFIÉ: import de db
import { collection, query, where, onSnapshot } from 'firebase/firestore'; // MODIFIÉ: imports pour firestore
import type { User as FirebaseUser } from 'firebase/auth';
import { getUserProfile } from '@/lib/firebase-actions';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const BottomNav = () => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0); // MODIFIÉ: état pour les messages non lus
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          if (profile && profile.profilePictures && profile.profilePictures.length > 0) {
            setProfilePicture(profile.profilePictures[0]);
          } else {
            setProfilePicture(null);
          }
        } catch (error) {
          console.error("Failed to fetch user profile for nav:", error);
          setProfilePicture(null);
        }
      } else {
        setProfilePicture(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // MODIFIÉ: Écouteur pour le total des messages non lus
  useEffect(() => {
    if (!currentUser) {
        setTotalUnread(0);
        return;
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let total = 0;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.unreadCount && data.unreadCount[currentUser.uid]) {
          total += data.unreadCount[currentUser.uid];
        }
      });
      setTotalUnread(total);
    });

    return () => unsubscribe();
  }, [currentUser]);
  
   const isDiscoverActive = pathname.startsWith('/discover');
   const isHomeActive = pathname === '/';
   const areMessagesActive = pathname.startsWith('/chat');
   const areSettingsActive = pathname.startsWith('/settings');
   const areFriendsActive = pathname.startsWith('/friends');

  const navItems = [
    { icon: Compass, label: 'Découvrir', href: '/discover', active: isDiscoverActive || isHomeActive },
    { icon: Users, label: 'Amis', href: '/friends', active: areFriendsActive },
    { icon: MessageSquare, label: 'Messages', href: '/chat', active: areMessagesActive },
    { icon: Settings, label: 'Paramètres', href: '/settings', active: areSettingsActive },
  ];
  
  const getProfileContent = () => {
    if (currentUser) {
      if (profilePicture) {
        return (
          <Avatar className="h-full w-full border-2 border-background group-hover:border-secondary transition-colors">
            <AvatarImage src={profilePicture} alt="User profile picture" className="object-cover" />
            <AvatarFallback>
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        );
      }
      return <User className="h-6 w-6 mx-auto" />;
    }
    return <UserPlus className="h-6 w-6 mx-auto" />;
  };
  
  const profileHref = currentUser ? `/profile?id=${currentUser.uid}` : '/login';
  const isProfileActive = currentUser ? pathname === `/profile` && new URLSearchParams(window.location.search).get('id') === currentUser.uid : false;
  const isUserLoggedIn = !!currentUser;

  const NavItem = ({ item }: { item: typeof navItems[0] }) => (
    <Tooltip>
        <TooltipTrigger asChild>
             <Link href={item.href} className="relative flex flex-col items-center justify-center h-full text-center"> { /* MODIFIÉ: Ajout de `relative` */ }
                <div
                    className={cn(
                        'flex flex-col items-center justify-center rounded-full h-12 w-12 p-1 transition-colors duration-200',
                        item.active ? 'text-primary' : 'text-muted-foreground'
                    )}
                >
                    <item.icon className="h-6 w-6" />
                </div>
                { /* MODIFIÉ: Affichage de la pastille de notification */ }
                {item.label === 'Messages' && totalUnread > 0 && (
                    <span className="absolute top-1 right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground" />
                )}
            </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="mb-2">
            <p>{item.label}</p>
        </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div className="fixed bottom-2 left-1/2 z-20 w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 md:bottom-4">
        <nav className="h-14 w-full rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur-md">
          <div className="grid h-full grid-cols-5 items-center justify-around">
            
            <NavItem item={navItems[0]} />
            <NavItem item={navItems[1]} />

            {/* Central Profile Button */}
            <div className="relative flex justify-center items-center h-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={profileHref} passHref className="group">
                    <div
                      className={cn(`flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all duration-300 ease-in-out hover:bg-primary/90`,
                      isProfileActive ? 'bg-accent' : 'bg-primary',
                      !isUserLoggedIn ? 'animate-pulse-slow' : ''
                      )}
                    >
                      <div className="h-10 w-10">
                          {getProfileContent()}
                      </div>
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="top" className="mb-2">
                   <p>{currentUser ? 'Profil' : 'Connexion'}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <NavItem item={navItems[2]} />
            <NavItem item={navItems[3]} />

          </div>
        </nav>
      </div>
    </TooltipProvider>
  );
};

export default BottomNav;
