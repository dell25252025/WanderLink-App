
'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { CountrySelect } from '@/components/country-select';
import { Button } from '@/components/ui/button';
import { Crosshair, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Geolocation } from '@capacitor/geolocation';

const allLanguages = [
    { id: 'fr', label: 'Français' },
    { id: 'en', label: 'Anglais' },
    { id: 'es', label: 'Espagnol' },
    { id: 'ar', label: 'Arabe' },
    { id: 'zh', label: 'Mandarin' },
    { id: 'hi', label: 'Hindi' },
    { id: 'bn', label: 'Bengali' },
    { id: 'pt', label: 'Portugais' },
    { id: 'ru', label: 'Russe' },
    { id: 'ja', label: 'Japonais' },
    { id: 'de', label: 'Allemand' },
    { id: 'jv', label: 'Javanais' },
    { id: 'ko', label: 'Coréen' },
    { id: 'te', label: 'Télougou' },
    { id: 'mr', label: 'Marathi' },
    { id: 'tr', label: 'Turc' },
    { id: 'ta', label: 'Tamoul' },
    { id: 'vi', label: 'Vietnamien' },
    { id: 'ur', label: 'Ourdou' },
    { id: 'it', label: 'Italien' },
    { id: 'th', label: 'Thaï' },
    { id: 'gu', label: 'Gujarati' },
    { id: 'fa', label: 'Persan' },
    { id: 'pl', label: 'Polonais' },
    { id: 'uk', label: 'Ukrainien' },
    { id: 'ro', label: 'Roumain' },
    { id: 'nl', label: 'Néerlandais' },
    { id: 'el', label: 'Grec' },
    { id: 'sv', label: 'Suédois' },
    { id: 'he', label: 'Hébreu' },
];


const Step2 = () => {
  const { control, setValue, getValues } = useFormContext();
  const [isLocating, setIsLocating] = useState(false);
  const { toast } = useToast();

  const handleLocate = async () => {
    setIsLocating(true);
    try {
      const permissionStatus = await Geolocation.checkPermissions();
      if (permissionStatus.location !== 'granted') {
        const requestStatus = await Geolocation.requestPermissions();
        if (requestStatus.location !== 'granted') {
          // User did not grant permission
          setIsLocating(false);
          return;
        }
      }

      // Get position with increased timeout and lower accuracy for better compatibility
      const position = await Geolocation.getCurrentPosition({ 
        timeout: 15000, 
        enableHighAccuracy: false 
      });

      const { latitude, longitude } = position.coords;
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=fr`);
      const data = await response.json();
      if (data?.address?.country) {
        setValue('location', data.address.country, { shouldValidate: true });
        toast({ title: "Position trouvée !", description: `Pays défini sur : ${data.address.country}` });
      } else {
        throw new Error("Pays non trouvé dans la réponse de l'API.");
      }
    } catch (error: any) {
      console.error("Error with geolocation:", error);
      // Avoid showing a toast if the user simply denied permission on the initial prompt
      if (error.message && !error.message.includes("denied")) {
          toast({ variant: 'destructive', title: "Erreur de localisation", description: "Impossible de déterminer votre position. Veuillez réessayer ou sélectionner manuellement." });
      }
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    const currentLocation = getValues('location');
    if (!currentLocation) {
      handleLocate();
    }
  }, []); // Empty dependency array ensures this runs only once when the component mounts

  return (
    <div className="space-y-6">
      {/* Section Position */}
      <div className="space-y-2">
          <h2 className="text-xl font-bold font-headline">Votre Position</h2>
          <p className="text-muted-foreground">Où êtes-vous basé ?</p>
          <div className="rounded-lg border bg-card p-4 space-y-4">
              <FormField
                control={control}
                name="location"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>Pays de résidence</FormLabel>
                    <FormControl>
                      <CountrySelect 
                        value={field.value}
                        onValueChange={field.onChange}
                        className="w-auto md:w-[250px]"
                      />
                    </FormControl>
                    <FormMessage className="col-span-full" />
                  </FormItem>
                )}
              />
              <Separator />
               <Button type="button" variant="outline" onClick={handleLocate} disabled={isLocating} className="w-full">
                  {isLocating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Crosshair className="mr-2 h-4 w-4" />
                  )}
                  Utiliser ma position actuelle
                </Button>
          </div>
      </div>

      <Separator />

      {/* Section Informations complémentaires */}
       <div className="space-y-2">
        <h2 className="text-xl font-bold font-headline">Informations complémentaires</h2>
         <p className="text-muted-foreground">Aidez les autres à en savoir plus sur vous.</p>
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <FormField
              control={control}
              name="languages"
              render={() => (
                  <FormItem>
                      <div className="mb-4">
                      <FormLabel className="text-base">Langues que je parle</FormLabel>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto p-2 border rounded-md">
                          {allLanguages.map((item) => (
                          <FormField
                              key={item.id}
                              control={control}
                              name="languages"
                              render={({ field }) => {
                              return (
                                  <FormItem
                                  key={item.id}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                  >
                                  <FormControl>
                                      <Checkbox
                                      checked={field.value?.includes(item.label)}
                                      onCheckedChange={(checked) => {
                                          return checked
                                          ? field.onChange([...(field.value || []), item.label])
                                          : field.onChange(
                                              field.value?.filter(
                                                  (value: string) => value !== item.label
                                              )
                                              )
                                      }}
                                      />
                                  </FormControl>
                                  <FormLabel className="font-normal">
                                      {item.label}
                                  </FormLabel>
                                  </FormItem>
                              )
                              }}
                          />
                          ))}
                      </div>
                      <FormMessage />
                  </FormItem>
              )}
          />
          <FormField
            control={control}
            name="height"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Taille (en cm) <span className="text-muted-foreground">(optionnel)</span></FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="Ex: 175" 
                    {...field} 
                    value={field.value ?? ''}
                    onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="weight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Poids (en kg) <span className="text-muted-foreground">(optionnel)</span></FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="Ex: 70" 
                    {...field} 
                    value={field.value ?? ''}
                    onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
};

export default Step2;
