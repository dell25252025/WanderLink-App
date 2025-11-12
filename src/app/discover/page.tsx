'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import WanderlinkHeader from '@/components/wanderlink-header';
import { CountrySelect } from '@/components/country-select';
import { GenericSelect } from '@/components/generic-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { AgeRangeSlider } from '@/components/ui/age-range-slider';
import type { DateRange } from 'react-day-picker';
import { travelIntentions, travelStyles, travelActivities } from '@/lib/options';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserProfile } from '@/lib/firebase-actions';
import type { DocumentData } from 'firebase/firestore';
import { Loader2, Search, Crown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';


// Initialize Algolia
const getAlgoliaConfig = httpsCallable(functions, 'getAlgoliaConfig');

export default function DiscoverPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<DocumentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPremiumDialogOpen, setIsPremiumDialogOpen] = useState(false);
    const [algoliaConfig, setAlgoliaConfig] = useState<{ appId: string, searchKey: string } | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [algoliaClient, setAlgoliaClient] = useState<any>(null);


    const usersIndex = useMemo(() => {
        if (algoliaClient) {
            return algoliaClient.initIndex("users");
        }
        return null;
    }, [algoliaClient]);

    const [showMe, setShowMe] = useState('Femme');
    const [ageRange, setAgeRange] = useState<[number, number]>([25, 45]);
    const [date, setDate] = useState<DateRange | undefined>();
    const [flexibleDates, setFlexibleDates] = useState(true);
    const [nearby, setNearby] = useState(true);
    const [country, setCountry] = useState('');
    const [destination, setDestination] = useState('Toutes');
    const [intention, setIntention] = useState('');
    const [travelStyle, setTravelStyle] = useState('Tous');
    const [activities, setActivities] = useState('Toutes');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                getUserProfile(user.uid).then(profile => {
                    setUserProfile(profile);
                    if (profile) {
                         if (profile.gender === 'Femme') {
                            setShowMe('Homme');
                        } else if (profile.gender === 'Autre') {
                            setShowMe('Autre');
                        } else {
                            setShowMe('Femme');
                        }
                    }
                    setLoading(false);
                });

                getAlgoliaConfig()
                    .then((result) => {
                        setAlgoliaConfig(result.data as any);
                    })
                    .catch((error) => {
                        console.error("Error fetching Algolia config:", error);
                    });

            } else {
                setLoading(false);
                router.push('/login');
            }
        });
        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        const initializeAlgolia = async () => {
            if (algoliaConfig && !algoliaClient) {
                try {
                    const algoliasearchModule = await import('algoliasearch');

                    console.log("--- ALGOLIA DEBUGGER --- START ---");

                    try {
                        const keys = Object.keys(algoliasearchModule);
                        console.log("ALGOLIA KEYS:", keys.join(', '));

                        for (const key of keys) {
                            console.log(`ALGOLIA TYPEOF [${key}] is`, typeof algoliasearchModule[key]);
                        }
                    } catch (e) {
                        console.log("ALGOLIA ERROR: Could not get object keys.");
                    }

                    console.log("ALGOLIA TYPEOF [.default] is", typeof algoliasearchModule.default);
                    console.log("--- ALGOLIA DEBUGGER --- END ---");


                    const algoliasearch = algoliasearchModule.default || algoliasearchModule;
                    if (typeof algoliasearch === 'function') {
                        const client = algoliasearch(algoliaConfig.appId, algoliaConfig.searchKey);
                        setAlgoliaClient(client);
                    } else {
                        console.error('Failed to import algoliasearch as a function.');
                    }
                } catch (error) {
                    console.error("Error dynamically importing Algolia:", error);
                }
            }
        };

        initializeAlgolia();
    }, [algoliaConfig, algoliaClient]);


    const handleNearbyChange = (checked: boolean) => {
        if (!userProfile?.isPremium && !checked) {
            setIsPremiumDialogOpen(true);
            return;
        }
        setNearby(checked);
        if (checked) {
            setCountry('');
        }
    };

    const handleFlexibleDatesChange = (checked: boolean) => {
        setFlexibleDates(checked);
        if (checked) {
            setDate(undefined);
        }
    };

    const handleSearch = async () => {
        if (!usersIndex || !userProfile) return;
        setIsSearching(true);
    
        const filters = [];
        if (showMe) filters.push(`gender:${showMe}`);
        
        const numericFilters = [];
        numericFilters.push(`age >= ${ageRange[0]}`);
        numericFilters.push(`age <= ${ageRange[1]}`);
    
        if (country && !nearby && userProfile.isPremium) filters.push(`location:"${country}"`);
        if (destination && destination !== 'Toutes') filters.push(`destination:"${destination}"`);
        if (intention && userProfile.isPremium) filters.push(`intention:"${intention}"`);
        if (travelStyle && travelStyle !== 'Tous' && userProfile.isPremium) filters.push(`travelStyle:"${travelStyle}"`);
        if (activities && activities !== 'Toutes' && userProfile.isPremium) filters.push(`activities:"${activities}"`);
    
        // Ensure we don't find the current user in the results
        filters.push(`NOT objectID:${userProfile.id}`);
    
        const searchOptions: any = {
            filters: filters.join(' AND '),
            numericFilters: numericFilters.join(' AND '),
        };
    
        if (nearby && userProfile.latitude && userProfile.longitude) {
            searchOptions.aroundLatLng = `${userProfile.latitude}, ${userProfile.longitude}`;
            searchOptions.aroundRadius = 50000; // 50km in meters
        }
    
        try {
            const { hits } = await usersIndex.search('', searchOptions);
            const searchResults = hits.map(hit => ({ ...hit, _highlightResult: undefined, _snippetResult: undefined, objectID: undefined }));
            localStorage.setItem('searchResults', JSON.stringify(searchResults));
            router.push('/');
        } catch (error) {
            console.error("Error searching with Algolia:", error);
        } finally {
            setIsSearching(false);
        }
    };
    
    
    const handlePremiumFeatureClick = () => {
        if (!userProfile?.isPremium) {
            setIsPremiumDialogOpen(true);
        }
    };

    const uniformSelectClass = "w-3/5 md:w-[45%] h-9 text-sm";
    const isPremium = userProfile?.isPremium ?? false;

    if (loading || !algoliaConfig) {
         return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <WanderlinkHeader />
            <main className="pt-12 pb-24">
                <div className="container mx-auto max-w-4xl px-4">
                     {/* Montre-moi Section */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-sm">Montre-moi</h2>
                      </div>
                      <div className="flex justify-center">
                        <ToggleGroup
                          type="single"
                          value={showMe}
                          onValueChange={(value) => { if (value) setShowMe(value) }}
                          className="w-auto justify-start bg-slate-100 dark:bg-slate-800 p-1 rounded-full"
                          variant='outline'
                          size="default"
                        >
                          <ToggleGroupItem value="Homme" aria-label="Montrer les hommes" className="text-sm h-9">Homme</ToggleGroupItem>
                          <ToggleGroupItem value="Femme" aria-label="Montrer les femmes" className="text-sm h-9">Femme</ToggleGroupItem>
                          <ToggleGroupItem value="Autre" aria-label="Montrer les autres personnes" className="text-sm h-9">Autre</ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>
                
                    <div className="space-y-4">
                        {/* Age Section */}
                        <div className="rounded-lg border bg-card p-3">
                            <AgeRangeSlider
                                value={ageRange}
                                onValueChange={setAgeRange}
                                className="text-sm"
                            />
                        </div>

                        {/* Position Section */}
                        <div className="space-y-1">
                            <h2 className="font-semibold text-sm">Position</h2>
                            <div className="rounded-lg border bg-card p-2 space-y-2">
                                <div className="flex items-center justify-between py-1 px-1">
                                    <Label htmlFor="nearby" className="text-sm font-normal">Personnes à proximité</Label>
                                    <Checkbox id="nearby" checked={nearby} onCheckedChange={handleNearbyChange} />
                                </div>
                                <Separator />
                                <div onClick={!isPremium && !nearby ? handlePremiumFeatureClick : undefined} className={cn(!isPremium && !nearby && 'cursor-pointer')}>
                                    <div className="flex items-center justify-between py-1 px-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('text-muted-foreground', (nearby || !isPremium) && 'opacity-50')}>Pays</span>
                                            {!isPremium && <Crown className="h-4 w-4 text-yellow-500" />}
                                        </div>
                                        <CountrySelect className={uniformSelectClass} value={country} onValueChange={setCountry} disabled={nearby || !isPremium} />
                                    </div>
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between py-1 px-1 text-sm">
                                    <span className="text-muted-foreground">Destination</span>
                                    <CountrySelect 
                                        className={uniformSelectClass} 
                                        value={destination} 
                                        onValueChange={setDestination} 
                                        placeholder="Toutes"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Dates de voyage Section */}
                        <div className="space-y-2">
                          <h2 className="font-semibold text-sm">Dates de voyage</h2>
                            <div className="rounded-lg border bg-card p-3 space-y-3">
                                <DateRangePicker date={date} onDateChange={setDate} disabled={flexibleDates} />
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="flexible-dates" checked={flexibleDates} onCheckedChange={handleFlexibleDatesChange} />
                                    <Label htmlFor="flexible-dates" className="text-sm">Mes dates sont flexibles</Label>
                                </div>
                            </div>
                        </div>

                        {/* Voyage Section */}
                        <div className="space-y-1">
                            <h2 className="font-semibold text-sm">Filtres Avancés</h2>
                            <div className="rounded-lg border bg-card p-2 space-y-2">
                                <div onClick={!isPremium ? handlePremiumFeatureClick : undefined} className={cn(!isPremium && 'cursor-pointer')}>
                                    <div className="flex items-center justify-between py-1 px-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('text-muted-foreground', !isPremium && 'opacity-50')}>Intention</span>
                                            {!isPremium && <Crown className="h-4 w-4 text-yellow-500" />}
                                        </div>
                                        <GenericSelect 
                                            className={uniformSelectClass}
                                            value={intention} 
                                            onValueChange={setIntention} 
                                            options={[{ value: '', label: 'Toutes' }, ...travelIntentions]}
                                            placeholder="Toutes"
                                            disabled={!isPremium}
                                        />
                                    </div>
                                </div>
                                <Separator />
                                <div onClick={!isPremium ? handlePremiumFeatureClick : undefined} className={cn(!isPremium && 'cursor-pointer')}>
                                    <div className="flex items-center justify-between py-1 px-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('text-muted-foreground', !isPremium && 'opacity-50')}>Style de voyage</span>
                                            {!isPremium && <Crown className="h-4 w-4 text-yellow-500" />}
                                        </div>
                                        <GenericSelect 
                                            className={uniformSelectClass}
                                            value={travelStyle} 
                                            onValueChange={setTravelStyle} 
                                            options={travelStyles} 
                                            placeholder="Tous"
                                            disabled={!isPremium}
                                        />
                                    </div>
                                </div>
                                <Separator />
                                <div onClick={!isPremium ? handlePremiumFeatureClick : undefined} className={cn(!isPremium && 'cursor-pointer')}>
                                    <div className="flex items-center justify-between py-1 px-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('text-muted-foreground', !isPremium && 'opacity-50')}>Activités</span>
                                            {!isPremium && <Crown className="h-4 w-4 text-yellow-500" />}
                                        </div>
                                        <GenericSelect 
                                            className={uniformSelectClass}
                                            value={activities} 
                                            onValueChange={setActivities} 
                                            options={travelActivities} 
                                            placeholder="Toutes"
                                            disabled={!isPremium}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
            <footer className="fixed bottom-0 z-10 w-full p-2 bg-background/80 backdrop-blur-sm border-t">
                <Button onClick={handleSearch} size="lg" className="w-full" disabled={isSearching || !algoliaClient}>
                    {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    {isSearching ? 'Recherche...' : 'Recherche'}
                </Button>
            </footer>

            <AlertDialog open={isPremiumDialogOpen} onOpenChange={setIsPremiumDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Crown className="text-yellow-500" />
                            Fonctionnalité WanderLink Gold
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Passez à Gold pour débloquer le Mode Passeport et les filtres avancés, et trouver le partenaire de voyage idéal où que vous soyez.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Plus tard</AlertDialogCancel>
                        <AlertDialogAction onClick={() => router.push('/premium')}>
                            Passer à Gold
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
