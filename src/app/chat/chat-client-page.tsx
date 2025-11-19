
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, MoreVertical, Ban, ShieldAlert, Smile, X, Phone, Video, Loader2, CheckCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getUserProfile } from '@/lib/firebase-actions';
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Picker, { type EmojiClickData, Categories, EmojiStyle } from 'emoji-picker-react';
import { Textarea } from '@/components/ui/textarea';
import { ReportAbuseDialog } from '@/components/report-abuse-dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore';
import type { DocumentData, Timestamp } from 'firebase/firestore';

// NOTE: Interface mise à jour pour correspondre à la structure Firestore
interface Message {
  id: string; // L'ID du document Firestore
  text: string;
  senderId: string;
  timestamp: Timestamp;
  imageUrl?: string | null;
  audioUrl?: string | null;
}

// NOTE: Helper pour générer un ID de chat cohérent
const getChatId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};


export default function ChatClientPage({ otherUserId }: { otherUserId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  
  const [currentUser, loadingAuth] = useAuthState(auth);
  const [otherUser, setOtherUser] = useState<DocumentData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]); // NOTE: Initialisé à vide
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // NOTE: Récupération du profil de l'autre utilisateur
  useEffect(() => {
    if (otherUserId) {
      getUserProfile(otherUserId).then(setOtherUser);
    }
  }, [otherUserId]);

  // NOTE: Le COEUR de la fonctionnalité : écoute des messages en temps réel
  useEffect(() => {
    if (!currentUser) return;

    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    setLoadingMessages(true);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs: Message[] = [];
      querySnapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [currentUser, otherUserId]);

  // Scroll automatique vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // NOTE: Fonction d'envoi de message mise à jour pour Firestore
  const handleSendMessage = async (e: React.FormEvent | React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !otherUser) return;

    const chatId = getChatId(currentUser.uid, otherUserId);
    const chatDocRef = doc(db, 'chats', chatId);
    const messagesColRef = collection(chatDocRef, 'messages');

    const messageText = newMessage;
    setNewMessage('');

    try {
      // Ajouter le nouveau message à la sous-collection
      await addDoc(messagesColRef, {
        text: messageText,
        senderId: currentUser.uid,
        timestamp: serverTimestamp(),
        imageUrl: null,
        audioUrl: null,
      });

      // Mettre à jour le document principal du chat pour la boîte de réception
      await setDoc(chatDocRef, {
        participants: [currentUser.uid, otherUserId],
        participantDetails: {
          [currentUser.uid]: {
            displayName: currentUser.displayName || 'Utilisateur',
            photoURL: currentUser.photoURL || '',
          },
          [otherUserId]: {
            displayName: otherUser.firstName || 'Utilisateur',
            photoURL: otherUser.profilePictures?.[0] || '',
            isVerified: otherUser.isVerified ?? false,
          }
        },
        lastMessage: {
          text: messageText,
          senderId: currentUser.uid,
          timestamp: serverTimestamp(),
        },
      }, { merge: true }); // merge: true est crucial pour ne pas écraser les données existantes

    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Le message n\'a pas pu être envoyé.' });
      setNewMessage(messageText); // Remettre le texte en cas d'erreur
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isDesktop) {
        event.preventDefault();
        handleSendMessage(event);
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = 120;
        textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [newMessage]);
  
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prevMessage => prevMessage + emojiData.emoji);
    if (!isDesktop) {
        setIsEmojiPickerOpen(false);
    }
  };

  const otherUserName = otherUser?.firstName || 'Utilisateur';
  const otherUserImage = otherUser?.profilePictures?.[0] || `https://picsum.photos/seed/${otherUserId}/200`;
  const otherUserIsVerified = otherUser?.isVerified ?? false;

  const showSendButton = newMessage.trim().length > 0;
  
  if (loadingAuth || !otherUser) {
      return (
          <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </div>
        )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="fixed top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 px-2 py-1 backdrop-blur-sm h-12">
        <Button onClick={() => router.back()} variant="ghost" size="icon" className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Link href={`/profile?id=${otherUserId}`} className="flex min-w-0 flex-1 items-center gap-2 truncate">
          <Avatar className="h-8 w-8">
            <AvatarImage src={otherUserImage} alt={otherUserName} />
            <AvatarFallback>{otherUserName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 truncate flex items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold">{otherUserName}</h1>
            {otherUserIsVerified && <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
          </div>
        </Link>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {}}>
          <Phone className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {}}>
          <Video className="h-4 w-4" />
        </Button>
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="mx-auto w-full max-w-sm">
                <DrawerHeader>
                    <DrawerTitle>Options</DrawerTitle>
                    <DrawerDescription>Gérez votre interaction avec {otherUserName}.</DrawerDescription>
                </DrawerHeader>
                <div className="p-4 pt-0">
                    <div className="mt-3 h-full">
                        <DrawerClose asChild>
                              <Button variant="outline" className="w-full justify-start p-4 h-auto text-base">
                                  <Ban className="mr-2 h-5 w-5" /> Bloquer
                              </Button>
                        </DrawerClose>
                        <div className="my-2 border-t"></div>
                        <DrawerClose asChild>
                              <Button variant="outline" className="w-full justify-start p-4 h-auto text-base" onClick={() => setIsReportModalOpen(true)}>
                                  <ShieldAlert className="mr-2 h-5 w-5" /> Signaler
                              </Button>
                        </DrawerClose>
                    </div>
                </div>
                <div className="p-4">
                    <DrawerClose asChild>
                        <Button variant="secondary" className="w-full h-12 text-base">Annuler</Button>
                    </DrawerClose>
                </div>
            </div>
          </DrawerContent>
        </Drawer>
      </header>

      <main className="flex-1 overflow-y-auto pt-12 pb-20">
        {loadingMessages ? (
            <div className="flex h-full w-full flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
            <div className="space-y-4 p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${
                    message.senderId === currentUser?.uid ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.senderId !== currentUser?.uid && (
                    <Avatar className="h-6 w-6">
                       <AvatarImage src={otherUserImage} alt={otherUserName} />
                       <AvatarFallback>{otherUserName.charAt(0)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm md:text-base break-words ${
                      message.senderId === currentUser?.uid
                        ? 'rounded-br-none bg-primary text-primary-foreground'
                        : 'rounded-bl-none bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {message.text}
                    {/* TODO: L\'envoi d\'images et d\'audio nécessite Firebase Storage - une prochaine étape */}
                  </div>
                </div>
              ))}
               <div ref={messagesEndRef} />
            </div>
        )}
      </main>

       <footer className="fixed bottom-0 z-10 w-full border-t bg-background/95 backdrop-blur-sm px-2 py-1.5">
        <form onSubmit={handleSendMessage} className="flex items-end gap-1.5 w-full">
             {/* NOTE: Le bouton '+' peut être réactivé plus tard avec Firebase Storage */}
            <div className="flex-1 relative flex items-center min-w-0 bg-secondary rounded-xl">
                <Textarea
                    ref={textareaRef}
                    rows={1}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message..."
                    className="w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent py-2.5 px-3 pr-8 min-h-[20px] max-h-32 overflow-y-auto text-sm"
                />
                
                <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
                  <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6">
                          <Smile className="h-4 w-4 text-muted-foreground" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-full max-w-[320px] p-0 border-none mb-2">
                    <Picker onEmojiClick={handleEmojiClick} emojiStyle={EmojiStyle.NATIVE} width="100%" />
                  </PopoverContent>
                </Popover>
            </div>
          
            <div className="shrink-0">
              <Button type="submit" variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-primary" disabled={!showSendButton}>
                  <Send className="h-4 w-4" />
              </Button>
            </div>
        </form>
      </footer>
      
      <ReportAbuseDialog 
        isOpen={isReportModalOpen} 
        onOpenChange={setIsReportModalOpen} 
        reportedUser={otherUser}
      />
    </div>
  );
}
