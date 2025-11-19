
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

import { Search, ArrowLeft, MoreVertical, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface Conversation {
  id: string;
  participants: string[];
  participantDetails: {
    [key: string]: {
      displayName: string;
      photoURL: string;
      isVerified?: boolean;
    }
  };
  lastMessage: {
    text: string;
    senderId: string;
    timestamp: any;
  } | null;
  unreadCount?: {
      [key: string]: number;
  };
}

export default function InboxPage() {
  const router = useRouter();
  const [user, loadingAuth] = useAuthState(auth);
  const [searchTerm, setSearchTerm] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      if (!loadingAuth) router.push('/login');
      return;
    };

    const q = query(collection(db, "chats"), where("participants", "array-contains", user.uid), orderBy("lastMessage.timestamp", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const convos: Conversation[] = [];
      querySnapshot.forEach((doc) => {
        convos.push({ id: doc.id, ...doc.data() } as Conversation);
      });
      setConversations(convos);
      setLoadingConversations(false);
    }, (error) => {
        console.error("Error fetching conversations: ", error);
        setLoadingConversations(false);
    });

    return () => unsubscribe();
  }, [user, loadingAuth, router]);

  const handleDeleteConversation = async () => {
    if (conversationToDelete) {
      try {
        await deleteDoc(doc(db, "chats", conversationToDelete));
        toast({ title: 'Conversation supprimée' });
        setConversationToDelete(null);
      } catch (error) {
        toast({ title: 'Erreur', variant: 'destructive' });
      }
    }
  };
  
  const filteredConversations = conversations.filter(convo => {
    if (!user) return false;
    const otherParticipantId = convo.participants.find(p => p !== user.uid);
    if (!otherParticipantId) return false;
    const otherParticipantName = convo.participantDetails?.[otherParticipantId]?.displayName || '';
    return otherParticipantName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getOtherParticipant = (convo: Conversation) => {
      const otherId = user ? convo.participants.find(p => p !== user.uid) : undefined;
      return {
          id: otherId || '',
          details: otherId ? convo.participantDetails?.[otherId] : null
      }
  }

  if (loadingAuth || loadingConversations) {
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
  }
  
  if (!user) return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="fixed top-0 z-20 w-full h-12 flex items-center justify-between border-b bg-background/95 px-2 py-1 backdrop-blur-sm md:px-4">
        <div className="flex items-center">
            <Button onClick={() => router.back()} variant="ghost" size="icon" className="h-8 w-8 -ml-2"><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-sm font-semibold ml-2">Messages</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-12 pb-4">
        <div className="container mx-auto max-w-2xl px-2">
            <div className="relative p-2 pt-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher..." className="pl-8 h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="mt-2">
                {filteredConversations.length > 0 ? (
                    <ul className="divide-y">
                    {filteredConversations.map((convo) => {
                        const otherParticipant = getOtherParticipant(convo);
                        if (!otherParticipant.details) return null;
                        const unread = convo.unreadCount?.[user.uid] || 0;

                        return (
                            <li key={convo.id} className="flex items-center gap-1 p-1.5 transition-colors hover:bg-muted/50">
                                <Link href={`/chat?id=${otherParticipant.id}`} className="flex flex-1 items-center gap-2 min-w-0">
                                    <Avatar className="h-9 w-9">
                                      <AvatarImage src={otherParticipant.details.photoURL} alt={otherParticipant.details.displayName} />
                                      <AvatarFallback>{otherParticipant.details.displayName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 truncate">
                                      <div className="flex items-baseline justify-between">
                                          <p className={`font-semibold truncate text-xs flex items-center gap-1 ${unread > 0 ? 'text-primary-foreground' : ''}`}>
                                            {otherParticipant.details.displayName}
                                            {otherParticipant.details.isVerified && <CheckCircle className="h-3 w-3 text-blue-500" />}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground">{convo.lastMessage?.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <p className={`truncate text-[11px] ${unread > 0 ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                            {convo.lastMessage?.text}
                                          </p>
                                          {unread > 0 && (
                                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                                {unread}
                                            </span>
                                          )}
                                      </div>
                                    </div>
                                </Link>
                                <AlertDialog open={conversationToDelete === convo.id} onOpenChange={() => setConversationToDelete(null)}>{/* ... */}</AlertDialog>
                            </li>
                        )
                    })}
                    </ul>
                ) : (
                    <p className="p-4 text-center text-sm text-muted-foreground">Aucune conversation.</p>
                )}
            </div>
        </div>
      </main>
    </div>
  );
}
