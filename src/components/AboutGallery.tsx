import React, { useState, useEffect, useRef } from 'react';
import { Camera, Map, Sparkles, Maximize2, Upload, Check, RefreshCw, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, onSnapshot } from 'firebase/firestore';

export interface PhotoItem {
  id: string;
  filename: string;
  title: string;
  subtitle: string;
  tag: string;
  aspect: string;
  fallbackKeywords: string;
}

export const INITIAL_PHOTOS: PhotoItem[] = [
  {
    id: 'photo-community',
    filename: 'IMG_8646.jpeg',
    title: 'La gran familia y el espíritu del Desafío al Volcán',
    subtitle: 'Unidos por la pasión deportiva, el compañerismo y la montaña en Caracas.',
    tag: 'Comunidad & Salida',
    aspect: 'aspect-[16/9]',
    fallbackKeywords: '8646'
  },
  {
    id: 'photo-trail',
    filename: 'IMG_8655.jpeg',
    title: 'Ruta Trail Running',
    subtitle: 'Ascenso por senderos de montaña hacia El Volcán',
    tag: 'Trail Running / Senderos',
    aspect: 'aspect-[4/3]',
    fallbackKeywords: '8655'
  },
  {
    id: 'photo-runners',
    filename: 'IMG_8651.jpeg',
    title: 'Ruta Asfalto',
    subtitle: 'Competencia, entrega y máxima determinación',
    tag: 'Competencia & Asfalto',
    aspect: 'aspect-[4/3]',
    fallbackKeywords: '8651'
  },
  {
    id: 'photo-founders',
    filename: 'IMG_8650.jpeg',
    title: 'Camaradería & Triunfo',
    subtitle: 'Pioneros, atletas y amigos celebrando con entusiasmo en plena carrera.',
    tag: 'Hermandad Deportiva',
    aspect: 'aspect-[4/3]',
    fallbackKeywords: '8650'
  },
  {
    id: 'photo-mask',
    filename: 'IMG_8654.jpeg',
    title: 'Pasión & Mística',
    subtitle: 'La alegría inagotable y la energía única de los participantes en la ruta hacia El Volcán.',
    tag: 'Energía & Pasión',
    aspect: 'aspect-[4/3]',
    fallbackKeywords: '8654'
  },
  {
    id: 'photo-summit',
    filename: 'IMG_8641.jpeg',
    title: 'Las Antenas & Meta',
    subtitle: 'La emblemática llegada a las antenas y la Hacienda Topito en la cumbre de El Volcán.',
    tag: 'La Meta en la Cumbre',
    aspect: 'aspect-[4/3]',
    fallbackKeywords: '8641'
  }
];

const STORAGE_PREFIX = 'desafio_volcan_photo_';

// Helper function to compress and resize an image before storing
const compressImage = (file: File, maxDimension = 1200, quality = 0.85): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Try webp or jpeg
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface AboutGalleryProps {
  onSelectImage: (img: { src: string; caption: string; tag: string }) => void;
}

export const AboutGallery: React.FC<AboutGalleryProps> = ({ onSelectImage }) => {
  const [photoData, setPhotoData] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 1. Listen to Firestore collection & fallback to localStorage
  useEffect(() => {
    // Initial local storage read
    const localStore: Record<string, string> = {};
    INITIAL_PHOTOS.forEach(p => {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${p.id}`) || localStorage.getItem(`${STORAGE_PREFIX}${p.filename}`);
      if (saved) localStore[p.id] = saved;
    });
    if (Object.keys(localStore).length > 0) {
      setPhotoData(prev => ({ ...prev, ...localStore }));
    }

    // Firestore real-time synchronization
    try {
      const unsub = onSnapshot(collection(db, 'gallery_photos'), (snapshot) => {
        const cloudData: Record<string, string> = {};
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data && data.photoId && data.dataUrl) {
            cloudData[data.photoId] = data.dataUrl;
            // Also cache locally
            try {
              localStorage.setItem(`${STORAGE_PREFIX}${data.photoId}`, data.dataUrl);
            } catch (e) {
              // ignore quota
            }
          }
        });
        if (Object.keys(cloudData).length > 0) {
          setPhotoData(prev => ({ ...prev, ...cloudData }));
        }
      }, (err) => {
        console.warn('Firestore gallery listener notice:', err);
      });

      return () => unsub();
    } catch (e) {
      console.warn('Firestore subscription failed, using local mode:', e);
    }
  }, []);

  const savePhoto = async (photoId: string, filename: string, dataUrl: string) => {
    // 1. Update State
    setPhotoData(prev => ({ ...prev, [photoId]: dataUrl }));

    // 2. Save in localStorage
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${photoId}`, dataUrl);
      localStorage.setItem(`${STORAGE_PREFIX}${filename}`, dataUrl);
    } catch (e) {
      console.warn('Local storage write limit:', e);
    }

    // 3. Save in Firestore Cloud Database
    try {
      await setDoc(doc(db, 'gallery_photos', photoId), {
        photoId,
        filename,
        dataUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Could not save photo to Firestore cloud:', err);
    }
  };

  const processFiles = async (files: FileList | File[], targetPhotoId?: string) => {
    setIsUploading(true);
    let count = 0;
    try {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        // Compress
        const compressedDataUrl = await compressImage(file, 1280, 0.85);

        // Find match
        let target = INITIAL_PHOTOS.find(p => p.id === targetPhotoId);
        if (!target) {
          target = INITIAL_PHOTOS.find(p => 
            file.name.toLowerCase().includes(p.fallbackKeywords) ||
            p.filename.toLowerCase().includes(file.name.toLowerCase()) ||
            file.name.toLowerCase().includes(p.filename.toLowerCase().replace('.jpeg', ''))
          );
        }

        // If still no match and we have unassigned slots, find the first without photo
        if (!target) {
          target = INITIAL_PHOTOS.find(p => !photoData[p.id]);
        }

        if (!target) {
          target = INITIAL_PHOTOS[count % INITIAL_PHOTOS.length];
        }

        if (target) {
          await savePhoto(target.id, target.filename, compressedDataUrl);
          count++;
        }
      }

      setUploadSuccess(`¡${count} ${count === 1 ? 'fotografía guardada' : 'fotografías guardadas'} y sincronizadas con éxito!`);
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err) {
      console.error('Error processing image:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const communityPhoto = INITIAL_PHOTOS[0];
  const trailPhoto = INITIAL_PHOTOS[1];
  const runnersPhoto = INITIAL_PHOTOS[2];
  const foundersPhoto = INITIAL_PHOTOS[3];
  const maskPhoto = INITIAL_PHOTOS[4];
  const summitPhoto = INITIAL_PHOTOS[5];

  const totalLoaded = INITIAL_PHOTOS.filter(p => Boolean(photoData[p.id])).length;

  const renderPhotoCard = (photo: PhotoItem, extraClasses: string = "") => {
    const src = photoData[photo.id];
    const isLoaded = Boolean(src);

    return (
      <div
        key={photo.id}
        className={`relative group rounded-3xl overflow-hidden shadow-md border ${isLoaded ? 'border-gray-800 bg-gray-950' : 'border-dashed border-orange-300 bg-gradient-to-b from-orange-50/50 to-amber-50/30'} cursor-pointer ${photo.aspect} ${extraClasses}`}
        onClick={() => {
          if (isLoaded) {
            onSelectImage({
              src,
              caption: photo.subtitle,
              tag: photo.tag
            });
          } else {
            singleFileInputRefs.current[photo.id]?.click();
          }
        }}
      >
        {isLoaded ? (
          <>
            <img
              src={src}
              alt={photo.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            {/* GRADIENT OVERLAY */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-5 md:p-6 text-white pointer-events-none">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-orange-500 text-white rounded-full text-[10px] font-black uppercase tracking-wider w-fit mb-1.5 shadow-sm">
                {photo.tag}
              </span>
              <h4 className="text-sm md:text-base font-black leading-snug">
                {photo.title}
              </h4>
              <p className="text-[11px] md:text-xs text-gray-200 mt-1 opacity-90 line-clamp-2">
                {photo.subtitle}
              </p>
            </div>

            {/* TOP ACTION BUTTONS */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              <button
                type="button"
                title="Cambiar fotografía"
                onClick={(e) => {
                  e.stopPropagation();
                  singleFileInputRefs.current[photo.id]?.click();
                }}
                className="bg-black/60 hover:bg-orange-500 backdrop-blur-md text-white p-2 rounded-full transition-all shadow-md active:scale-95"
              >
                <Upload size={14} />
              </button>
              <div className="bg-black/50 backdrop-blur-md text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 size={14} />
              </div>
            </div>
          </>
        ) : (
          /* PLACEHOLDER WHEN NOT YET UPLOADED */
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-orange-950 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
              <Upload size={22} />
            </div>
            <div>
              <span className="inline-block px-2.5 py-0.5 bg-orange-200/80 text-orange-900 rounded-full text-[10px] font-black uppercase tracking-wider mb-1">
                {photo.tag} ({photo.filename})
              </span>
              <h4 className="text-xs font-black text-gray-900 line-clamp-1">{photo.title}</h4>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Haz clic aquí para seleccionar {photo.filename}</p>
            </div>
            <button
              type="button"
              className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-sm transition-all"
            >
              Seleccionar foto
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          ref={el => { singleFileInputRefs.current[photo.id] = el; }}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              processFiles(e.target.files, photo.id);
            }
          }}
        />
      </div>
    );
  };

  return (
    <div 
      className="space-y-6"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* QUICK UPLOAD ACTION BANNER */}
      <div className={`relative rounded-3xl p-5 md:p-6 border transition-all duration-300 ${
        isDragging 
          ? 'bg-orange-100 border-orange-500 ring-4 ring-orange-300' 
          : 'bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white border-orange-400 shadow-lg'
      }`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center shrink-0 shadow-inner">
              <Camera size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-white">
                  Galería Fotográfica Histórica
                </h4>
                <span className="px-2 py-0.5 bg-black/20 text-white text-[10px] font-black rounded-full backdrop-blur-sm">
                  {totalLoaded} / 6 fotos cargadas
                </span>
              </div>
              <p className="text-xs text-orange-100 font-medium mt-0.5">
                Haz clic en el botón para cargar las 6 fotografías desde tu dispositivo (se guardan en la nube permanentemente).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <input
              type="file"
              accept="image/*"
              multiple
              ref={multiFileInputRef}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) processFiles(e.target.files);
              }}
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => multiFileInputRef.current?.click()}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-orange-50 active:scale-95 text-orange-600 rounded-2xl text-xs font-black shadow-md transition-all uppercase tracking-wider"
            >
              {isUploading ? (
                <>
                  <RefreshCw size={16} className="animate-spin text-orange-600" />
                  <span>Guardando fotos...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Subir las 6 Fotos Ahora</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {uploadSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-black flex items-center gap-3 shadow-sm"
        >
          <Check size={18} className="text-emerald-600 shrink-0" />
          <span>{uploadSuccess}</span>
        </motion.div>
      )}

      {/* 1. HERO COMMUNITY PHOTO */}
      {renderPhotoCard(communityPhoto, "w-full aspect-[16/9] md:aspect-[21/9]")}

      {/* 2. ROUTES DUAL PHOTOS (TRAIL & ROAD) */}
      <div className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-orange-600 flex items-center gap-2">
          <Map size={16} /> Fotografías de las Rutas
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderPhotoCard(trailPhoto)}
          {renderPhotoCard(runnersPhoto)}
        </div>
      </div>

      {/* 3. MOMENTS & SUMMIT (3 PHOTOS) */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
          <Sparkles size={14} className="text-orange-500" />
          <span>Momentos Históricos & Meta</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderPhotoCard(foundersPhoto)}
          {renderPhotoCard(maskPhoto)}
          {renderPhotoCard(summitPhoto)}
        </div>
      </div>
    </div>
  );
};
