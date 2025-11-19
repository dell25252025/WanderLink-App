
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, MoreVertical, Ban, ShieldAlert, Smile, X, Phone, Video, Loader2, CheckCircle, Plus, ImageIcon, Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getUserProfile } from '@/lib/firebase-actions';
import { auth, db, storage } from '@/lib/firebase'; // NOTE: Import de storage
import { useAuthState } from 'react-firebase-hooks/auth';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Picker, { type EmojiClickData, Categories, EmojiStyle } from 'emoji-picker-react';
import { Dialog, DialogContent, DialogTrigger, DialogClose, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ReportAbuseDialog } from '@/components/report-abuse-dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; // NOTE: Imports pour l'upload
import type { DocumentData, Timestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid'; // NOTE: Pour générer des IDs d'image uniques

interface Message {
  id: string;
  text: string | null; // Le texte est maintenant optionnel
  senderId: string;
  timestamp: Timestamp;
  imageUrl?: string | null;
}

const getChatId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};

export default function ChatClientPage({ otherUserId }: { otherUserId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  
  const [currentUser, loadingAuth] = useAuthState(auth);
  const [otherUser, setOtherUser] = useState<DocumentData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false); // NOTE: État pour le chargement de l'upload
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (otherUserId) {
      getUserProfile(otherUserId).then(setOtherUser);
    }
  }, [otherUserId]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // NOTE: Fonction générique pour envoyer un message (texte ou image)
  const sendMessage = async (text: string | null, imageUrl: string | null) => {
    if (!currentUser || !otherUser) return;

    const chatId = getChatId(currentUser.uid, otherUserId);
    const chatDocRef = doc(db, 'chats', chatId);
    const messagesColRef = collection(chatDocRef, 'messages');

    try {
      await addDoc(messagesColRef, {
        text,
        imageUrl,
        senderId: currentUser.uid,
        timestamp: serverTimestamp(),
      });

      await setDoc(chatDocRef, {
        participants: [currentUser.uid, otherUserId],
        participantDetails: {
          [currentUser.uid]: { displayName: currentUser.displayName || 'Moi', photoURL: currentUser.photoURL || '' },
          [otherUserId]: { displayName: otherUser.firstName || 'Utilisateur', photoURL: otherUser.profilePictures?.[0] || '', isVerified: otherUser.isVerified ?? false }
        },
        lastMessage: {
          text: imageUrl ? '📷 Photo' : text,
          senderId: currentUser.uid,
          timestamp: serverTimestamp(),
        },
      }, { merge: true });

    } catch (error) {
      console.error("Error sending message:", error);
      toast({ variant: 'destructive', title: 'Erreur', description: "Le message n'a pas pu être envoyé." });
    }
  };

  const handleTextSend = (e: React.FormEvent | React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessage(newMessage.trim(), null);
      setNewMessage('');
    }
  };
  
  // NOTE: Nouvelle fonction pour gérer l'envoi d'images
  const handleImageSend = async (file: File) => {
      if (!file || !currentUser) return;

      setIsUploading(true);
      toast({ title: "Envoi de l'image..." });

      try {
          const imageId = uuidv4();
          const storageRef = ref(storage, `chat_images/${getChatId(currentUser.uid, otherUserId)}/${imageId}`);

          const snapshot = await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);

          await sendMessage(null, downloadURL);
          toast({ title: "Image envoyée !" });
      } catch (error) {
          console.error("Error uploading image:", error);
          toast({ variant: 'destructive', title: 'Erreur d\'upload', description: "L'image n'a pas pu être envoyée." });
      }
      finally {
          setIsUploading(false);
      }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          handleImageSend(e.target.files[0]);
      }
      e.target.value = ''; // Reset input
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isDesktop) {
        event.preventDefault();
        handleTextSend(event);
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [newMessage]);
  
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prevMessage => prevMessage + emojiData.emoji);
    if (!isDesktop) setIsEmojiPickerOpen(false);
  };

  const otherUserName = otherUser?.firstName || 'Utilisateur';
  const otherUserImage = otherUser?.profilePictures?.[0] || `https://picsum.photos/seed/${otherUserId}/200`;
  const otherUserIsVerified = otherUser?.isVerified ?? false;

  const showSendButton = newMessage.trim().length > 0;
  
  if (loadingAuth || !otherUser) {
      return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="fixed top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 px-2 py-1 backdrop-blur-sm h-12">
        <Button onClick={() => router.back()} variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
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
        <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Video className="h-4 w-4" /></Button>
        <Drawer><DrawerTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DrawerTrigger><DrawerContent> {/* ... Contenu du Drawer ... */} </DrawerContent></Drawer>
      </header>

      <main className="flex-1 overflow-y-auto pt-12 pb-20">
        {loadingMessages ? (
            <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
            <div className="space-y-4 p-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex items-end gap-2 ${message.senderId === currentUser?.uid ? 'justify-end' : 'justify-start'}`}>
                  {message.senderId !== currentUser?.uid && <Avatar className="h-6 w-6"><AvatarImage src={otherUserImage} /><AvatarFallback>{otherUserName.charAt(0)}</AvatarFallback></Avatar>}
                  <div className={`max-w-[70%] rounded-2xl text-sm md:text-base break-words ${message.imageUrl ? 'p-1 bg-transparent' : 'px-3 py-2'} ${message.senderId === currentUser?.uid ? 'rounded-br-none bg-primary text-primary-foreground' : 'rounded-bl-none bg-secondary text-secondary-foreground'}`}>
                    {message.text && <p>{message.text}</p>}
                    {message.imageUrl && (
                      <Dialog>
                        <DialogTrigger><Image src={message.imageUrl} alt="Image envoyée" width={200} height={200} className="rounded-xl object-cover cursor-pointer" /></DialogTrigger>
                        <DialogContent className="p-0 m-0 w-full h-full max-w-full max-h-screen bg-black/80 backdrop-blur-sm border-0 flex items-center justify-center">
                          <DialogHeader className="sr-only"><DialogTitle>Image</DialogTitle></DialogHeader>
                          <div className="relative w-full h-full"><Image src={message.imageUrl} alt="Image en plein écran" fill className="object-contain"/></div>
                          <DialogClose className="absolute top-2 right-2 p-2 rounded-full bg-black/30 text-white"><X className="h-6 w-6" /></DialogClose>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              ))}
              {isUploading && <div className="flex justify-end"><div className="p-2"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/></div></div>}
               <div ref={messagesEndRef} />
            </div>
        )}
      </main>

       <footer className="fixed bottom-0 z-10 w-full border-t bg-background/95 backdrop-blur-sm px-2 py-1.5">
        <form onSubmit={handleTextSend} className="flex items-end gap-1.5 w-full">
            <Popover>
              <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0 h-8 w-8"><Plus className="h-4 w-4 text-muted-foreground" /></Button></PopoverTrigger>
              <PopoverContent className="w-auto p-1 mb-2"><div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon"><Camera className="h-4 w-4" /></Button> { /* TODO */ }
              </div></PopoverContent>
            </Popover>
          
            <div className="flex-1 relative flex items-center min-w-0 bg-secondary rounded-xl">
                <Textarea ref={textareaRef} rows={1} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} placeholder="Message..." className="w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent py-2.5 px-3 pr-8 min-h-[20px] max-h-32 overflow-y-auto text-sm"/>
                <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6"><Smile className="h-4 w-4 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent side="top" align="end" className="w-full max-w-[320px] p-0 border-none mb-2"><Picker onEmojiClick={handleEmojiClick} emojiStyle={EmojiStyle.NATIVE} width="100%" /></PopoverContent></Popover>
            </div>
          
            <div className="shrink-0">
              <Button type="submit" variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-primary" disabled={!showSendButton}><Send className="h-4 w-4" /></Button>
            </div>
        </form>
         <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect}/>
      </footer>
      
      <ReportAbuseDialog isOpen={isReportModalOpen} onOpenChange={setIsReportModalOpen} reportedUser={otherUser}/>
    </div>
  );
}
