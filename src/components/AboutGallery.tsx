import React, { useState, useEffect } from 'react';
import { Map, Sparkles, Maximize2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export interface PhotoItem {
  id: string;
  filename: string;
  title: string;
  subtitle: string;
  tag: string;
  aspect: string;
}

export const INITIAL_PHOTOS: PhotoItem[] = [
  {
    id: 'photo-community',
    filename: 'IMG_8646.jpeg',
    title: 'La gran familia y el espíritu del Desafío al Volcán',
    subtitle: 'Unidos por la pasión deportiva, el compañerismo y la montaña en Caracas.',
    tag: 'Comunidad & Salida',
    aspect: 'aspect-[16/9]'
  },
  {
    id: 'photo-trail',
    filename: 'IMG_8655.jpeg',
    title: 'Ruta Trail Running',
    subtitle: 'Ascenso por senderos de montaña hacia El Volcán',
    tag: 'Trail Running / Senderos',
    aspect: 'aspect-[4/3]'
  },
  {
    id: 'photo-runners',
    filename: 'IMG_8651.jpeg',
    title: 'Ruta Asfalto',
    subtitle: 'Competencia, entrega y máxima determinación',
    tag: 'Competencia & Asfalto',
    aspect: 'aspect-[4/3]'
  },
  {
    id: 'photo-founders',
    filename: 'IMG_8650.jpeg',
    title: 'Camaradería & Triunfo',
    subtitle: 'Pioneros, atletas y amigos celebrando con entusiasmo en plena carrera.',
    tag: 'Hermandad Deportiva',
    aspect: 'aspect-[4/3]'
  },
  {
    id: 'photo-mask',
    filename: 'IMG_8654.jpeg',
    title: 'Pasión & Mística',
    subtitle: 'La alegría inagotable y la energía única de los participantes en la ruta hacia El Volcán.',
    tag: 'Energía & Pasión',
    aspect: 'aspect-[4/3]'
  },
  {
    id: 'photo-summit',
    filename: 'IMG_8641.jpeg',
    title: 'Las Antenas & Meta',
    subtitle: 'La emblemática llegada a las antenas y la Hacienda Topito en la cumbre de El Volcán.',
    tag: 'La Meta en la Cumbre',
    aspect: 'aspect-[4/3]'
  }
];

const STORAGE_PREFIX = 'desafio_volcan_photo_';

interface AboutGalleryProps {
  onSelectImage: (img: { src: string; caption: string; tag: string }) => void;
}

export const AboutGallery: React.FC<AboutGalleryProps> = ({ onSelectImage }) => {
  const [photoData, setPhotoData] = useState<Record<string, string>>({});

  // 1. Read from localStorage & Firestore real-time synchronization
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

  const communityPhoto = INITIAL_PHOTOS[0];
  const trailPhoto = INITIAL_PHOTOS[1];
  const runnersPhoto = INITIAL_PHOTOS[2];
  const foundersPhoto = INITIAL_PHOTOS[3];
  const maskPhoto = INITIAL_PHOTOS[4];
  const summitPhoto = INITIAL_PHOTOS[5];

  const renderPhotoCard = (photo: PhotoItem, extraClasses: string = "") => {
    const src = photoData[photo.id];
    if (!src) return null;

    return (
      <div
        key={photo.id}
        className={`relative group rounded-3xl overflow-hidden shadow-lg border border-gray-100 bg-gray-950 cursor-pointer ${photo.aspect} ${extraClasses}`}
        onClick={() => {
          onSelectImage({
            src,
            caption: photo.subtitle,
            tag: photo.tag
          });
        }}
      >
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

        {/* TOP EXPAND ICON */}
        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 size={14} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
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
