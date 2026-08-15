import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Calendar, 
  User as UserIcon, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Info,
  Facebook,
  Twitter,
  MessageCircle,
  Share2,
  LogOut,
  MapPin,
  Map,
  Mail,
  CreditCard,
  Camera,
  Sparkles,
  Maximize2,
  X,
  Users,
  Printer,
  Download,
  Send,
  ExternalLink,
  FileText,
  Settings
} from 'lucide-react';
import { APP_CONFIG } from './config';
import { AboutGallery } from './components/AboutGallery';
import { auth, db } from './lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

// --------------------------------------------------------------------------------
// UTILS & HELPERS
// --------------------------------------------------------------------------------

export const getAge = (day: string, month: string, year: string): number | null => {
  if (!day || !month || !year) return null;
  const birthDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

export const getCategoryByAge = (age: number | null): string => {
  if (age === null || isNaN(age)) return '';
  if (age < 5) return `Menor de 5 años (${age} años)`;
  if (age <= 11) return `Infantil / Semillero (5-11 años)`;
  if (age <= 15) return `Juvenil (12-15 años)`;
  if (age <= 29) return `Libre (16-29 años)`;
  if (age <= 39) return `Sub-Master (30-39 años)`;
  if (age <= 49) return `Master A (40-49 años)`;
  if (age <= 59) return `Master B (50-59 años)`;
  return `Master C (60+ años)`;
};

// --------------------------------------------------------------------------------
// VALIDATION SCHEMA (A PARTIR DE 5 AÑOS)
// --------------------------------------------------------------------------------

const registrationSchema = z.object({
  fullName: z.string().min(3, 'El nombre completo es requerido'),
  email: z.string().email('Debe ser un correo electrónico válido'),
  cedula: z.string().min(6, 'Cédula muy corta (mínimo 6 caracteres)'),
  birthDay: z.string().min(1, 'Día requerido'),
  birthMonth: z.string().min(1, 'Mes requerido'),
  birthYear: z.string().min(4, 'Año requerido'),
}).refine((data) => {
  if (!data.birthDay || !data.birthMonth || !data.birthYear) return true;
  const age = getAge(data.birthDay, data.birthMonth, data.birthYear);
  if (age === null) return true;
  return age >= 5;
}, {
  message: "La edad mínima requerida para registrarse es de 5 años",
  path: ["birthYear"]
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

// --------------------------------------------------------------------------------
// DATES CONSTANTS
// --------------------------------------------------------------------------------

const months = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 95 }, (_, i) => (currentYear - i).toString());

// --------------------------------------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------------------------------------

export default function App() {
  const [session, setSession] = useState<{ fullName: string; idNumber: string } | null>(() => {
    const saved = localStorage.getItem('race_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ fullName: '', idNumber: '' });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [emailDispatchResult, setEmailDispatchResult] = useState<{
    participantSent: boolean;
    adminSent: boolean;
    providerUsed: string;
    deliveryError?: string | null;
  } | null>(null);
  const [showEmailConfigModal, setShowEmailConfigModal] = useState(false);
  const [lastRegistered, setLastRegistered] = useState<{
    fullName: string;
    email: string;
    cedula: string;
    category: string;
    age: number;
    birthDay?: string;
    birthMonth?: string;
    birthYear?: string;
  } | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'register' | 'about' | 'contact' | 'history'>('register');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userRegistrations, setUserRegistrations] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ src: string; caption: string; tag: string } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors }
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema)
  });

  const watchDay = watch('birthDay');
  const watchMonth = watch('birthMonth');
  const watchYear = watch('birthYear');

  const currentCalculatedAge = getAge(watchDay, watchMonth, watchYear);
  const currentCategory = getCategoryByAge(currentCalculatedAge);

  // Fetch History by ID Number
  const fetchHistory = async (idNumber: string) => {
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'registrations'), 
        where('idNumber', '==', idNumber.trim())
      );
      const querySnapshot = await getDocs(q);
      const regs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Safe client-side sorting
      regs.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (new Date(a.createdAt || 0).getTime() || 0);
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (new Date(b.createdAt || 0).getTime() || 0);
        return timeB - timeA;
      });
      setUserRegistrations(regs);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Calculate days based on month and year
  const getDaysInMonth = (month: string, year: string) => {
    if (!month) return 31;
    const m = parseInt(month);
    const y = year ? parseInt(year) : 2000;
    return new Date(y, m, 0).getDate();
  };

  const dynamicDaysCount = getDaysInMonth(watchMonth, watchYear);
  const dynamicDays = Array.from({ length: dynamicDaysCount }, (_, i) => (i + 1).toString());

  // Update effect to use session
  useEffect(() => {
    if (session) {
      setValue('fullName', session.fullName);
      setValue('cedula', session.idNumber);
      fetchHistory(session.idNumber);
    }
  }, [session, setValue]);

  const handleSimpleLogin = () => {
    if (loginForm.fullName && loginForm.idNumber) {
      const newSession = { fullName: loginForm.fullName.trim(), idNumber: loginForm.idNumber.trim() };
      setSession(newSession);
      localStorage.setItem('race_session', JSON.stringify(newSession));
      setShowLoginModal(false);
      setLoginForm({ fullName: '', idNumber: '' });
    }
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('race_session');
    setUserRegistrations([]);
    reset();
  };

  const onSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    setSubmissionError(null);
    
    try {
      const calculatedAge = getAge(data.birthDay, data.birthMonth, data.birthYear) || 0;
      const category = getCategoryByAge(calculatedAge);

      // 1. Prepare data for Firestore
      const registrationData = {
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        idNumber: data.cedula.trim(),
        birthDay: data.birthDay,
        birthMonth: data.birthMonth,
        birthYear: data.birthYear,
        age: calculatedAge,
        category: category,
        userId: session?.idNumber || 'anonymous',
        createdAt: serverTimestamp(),
        status: 'registered'
      };

      // 2. Save to Firestore
      try {
        await addDoc(collection(db, 'registrations'), registrationData);
      } catch (fsError) {
        console.warn('Firestore direct write notice:', fsError);
      }

      // Also keep local offline copy for participant safety
      try {
        const backupKey = 'desafio_local_registrations';
        const existing = JSON.parse(localStorage.getItem(backupKey) || '[]');
        existing.unshift({
          ...registrationData,
          createdAt: new Date().toISOString(),
          id: `reg_${Date.now()}`
        });
        localStorage.setItem(backupKey, JSON.stringify(existing.slice(0, 50)));
      } catch (storageErr) {
        console.warn('Local backup note:', storageErr);
      }

      // 3. Send email confirmation through server endpoint
      let emailDetails = null;
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName: data.fullName.trim(),
            email: data.email.trim().toLowerCase(),
            cedula: data.cedula.trim(),
            birthDay: data.birthDay,
            birthMonth: data.birthMonth,
            birthYear: data.birthYear,
          }),
        });
        if (response.ok) {
          const resJson = await response.json();
          emailDetails = resJson.emailDetails || null;
        }
      } catch (apiError) {
        console.warn('Email notification notice:', apiError);
      }

      setEmailDispatchResult(emailDetails);

      setLastRegistered({
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        cedula: data.cedula.trim(),
        category,
        age: calculatedAge,
        birthDay: data.birthDay,
        birthMonth: data.birthMonth,
        birthYear: data.birthYear,
      });

      setIsSubmitted(true);
      reset();
      if (session) fetchHistory(session.idNumber);
    } catch (error) {
      console.error('Registration Error:', error);
      setSubmissionError('Ocurrió un inconveniente al procesar la inscripción. Por favor verifica tus datos e inténtalo nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const NavMenu = () => (
    <div className="fixed top-6 right-6 z-50">
      <button 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="bg-white p-4 rounded-2xl shadow-xl border border-gray-100 hover:bg-gray-50 transition-all group"
      >
        <div className="space-y-1.5">
          <motion.div 
            animate={isMenuOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
            className="w-6 h-0.5 bg-gray-900 rounded-full" 
          />
          <motion.div 
            animate={isMenuOpen ? { opacity: 0 } : { opacity: 1 }}
            className="w-6 h-0.5 bg-gray-900 rounded-full" 
          />
          <motion.div 
            animate={isMenuOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
            className="w-6 h-0.5 bg-gray-900 rounded-full" 
          />
        </div>
      </button>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-20 right-0 w-64 bg-white rounded-[2rem] shadow-2xl border border-gray-100 p-4 ring-1 ring-black/5"
          >
            <nav className="flex flex-col space-y-2">
              {[
                { id: 'register', label: 'Inscríbete', icon: Trophy },
                { id: 'history', label: 'Mis Inscripciones', icon: Calendar, needsAuth: true },
                { id: 'about', label: '¿Quiénes somos?', icon: Info },
                { id: 'contact', label: 'Contacto', icon: UserIcon }
              ].map((item) => (
                (!item.needsAuth || session) && (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id as any);
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center space-x-3 p-4 rounded-2xl font-bold transition-all ${
                      currentView === item.id 
                      ? 'bg-orange-50 text-orange-600' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              ))}

              <div className="pt-4 mt-4 border-t border-gray-100">
                {session ? (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3 px-4 py-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 font-bold text-xs">
                        {session.fullName.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-900 truncate max-w-[120px]">{session.fullName}</span>
                        <span className="text-[8px] text-gray-500 truncate max-w-[120px]">ID: {session.idNumber}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 p-4 rounded-2xl font-bold text-red-500 hover:bg-red-50 transition-all"
                    >
                      <LogOut size={18} />
                      <span>Salir</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowLoginModal(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 p-4 rounded-2xl font-bold text-gray-900 hover:bg-gray-50 transition-all"
                  >
                    <UserIcon size={18} />
                    <span>Acceder / Historial</span>
                  </button>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#1a1a1a] p-4 md:p-8 relative">
      <NavMenu />
      
      {currentView === 'about' ? (
        /* FULL-PAGE VIEW FOR ¿QUIÉNES SOMOS? */
        <motion.div
          key="about-full-page"
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.99 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl mx-auto mb-12"
        >
          <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 md:p-12 shadow-2xl shadow-gray-200/50 border border-gray-50 flex flex-col space-y-8 text-left">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  <Trophy size={14} />
                  <span>Historia & Legado</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-[#1a1a1a] tracking-tight">
                  ¿Quiénes somos?
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView('register')}
                className="self-start sm:self-center flex items-center space-x-2 px-5 py-3 bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold rounded-2xl text-xs transition-all active:scale-95 shadow-sm"
              >
                <span>Ir al Registro</span>
                <ChevronRight size={16} />
              </button>
            </div>

            {/* STORY CONTENT & HISTORICAL GALLERY */}
            <div className="space-y-8 text-gray-600 font-medium text-base md:text-lg leading-relaxed">
              <p>
                El <strong className="text-gray-900 font-black">Desafío al Volcán</strong> nació como una propuesta innovadora gracias al impulso de sus pilares fundadores: <span className="font-bold text-gray-800">Ricardo Sanguino, Manuel Rojas, Carmen Contreras, Reyes Aldana</span> y las marcas que decidieron apostar por el proyecto desde el primer momento. En sus inicios, comenzó exclusivamente como una competencia de ciclismo y, con el tiempo, incorporó la modalidad de trail running.
              </p>

              {/* RUTAS ORIGINALES TEXT BOX */}
              <div className="bg-orange-50/70 p-6 md:p-8 rounded-3xl border border-orange-100 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-orange-600 flex items-center gap-2">
                  <Map size={18} /> Las rutas originales
                </h4>
                
                <ul className="space-y-4 text-sm md:text-base text-gray-700">
                  <li className="flex items-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-2 shrink-0" />
                    <span><strong className="text-gray-900 font-bold">Ciclismo:</strong> Inicia desde Las Mercedes y culminaba en la Hacienda Topito, ascendiendo al volcán por la vía de asfalto.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-2 shrink-0" />
                    <span><strong className="text-gray-900 font-bold">Trail Running:</strong> Iniciaba desde el Polideportivo de La Trinidad, pero adentrándose por los senderos de la montaña del volcán hasta llegar a la misma hacienda.</span>
                  </li>
                </ul>
              </div>

              {/* DYNAMIC HISTORICAL PHOTO GALLERY */}
              <AboutGallery onSelectImage={setSelectedImage} />

              <p>
                Hoy comienza una <strong className="text-gray-900 font-black">nueva era para el Desafío al Volcán</strong>. Este renacimiento está liderado por <span className="font-bold text-gray-800">Reyes Aldana y Carmen Contreras</span> (dos de sus figuras históricas más importantes) junto a la incorporación de <span className="font-bold text-gray-800">Johnny Aldana</span>.
              </p>

              <div className="p-6 md:p-8 bg-gray-50 rounded-3xl border border-gray-100 text-gray-700 text-sm md:text-base leading-relaxed">
                <p>
                  Este proyecto busca marcar un punto de partida y rescatar aquellas emblemáticas carreras que con los años se han perdido, honrando el esfuerzo y el sacrificio de los organizadores que abrieron camino. <span className="font-black text-orange-600">¡Venimos con todo y con muchos proyectos más por delante!</span>
                </p>
              </div>
            </div>

            {/* FOOTER CALL TO ACTION */}
            <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                Desafío El Volcán — New Era
              </p>
              <button
                type="button"
                onClick={() => setCurrentView('register')}
                className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-orange-200 transition-all flex items-center justify-center space-x-2 text-sm"
              >
                <span>Volver e Inscribirse</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        
        {/* LEFT COLUMN: INFO & HEADER */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-5 flex flex-col justify-start space-y-8"
        >
          <header>
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              <Trophy size={14} />
              <span>Inscripciones Abiertas</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-black text-[#1a1a1a] leading-[0.9] tracking-tighter mb-2">
              {APP_CONFIG.raceName.split(' ').map((word, i) => (
                <span key={i} className="block">{word}</span>
              ))}
            </h1>
            <p className="text-sm font-bold text-orange-500 uppercase tracking-[0.2em] mb-4">
              new era
            </p>
            <p className="text-gray-500 font-medium max-w-sm">
              Únete a la gran fiesta de running y trail en Caracas. Vive la pasión por la montaña y el deporte.
            </p>
          </header>

          {/* EVENT DETAILS BOX */}
          <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 opacity-50" />
            <h3 className="text-lg font-bold flex items-center space-x-2 mb-4 relative z-10">
              <Trophy className="text-orange-500" />
              <span>Información del Evento</span>
            </h3>
            <div className="space-y-4 relative z-10">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-orange-50 text-orange-500 rounded-xl">
                  <MapPin size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Ubicación</span>
                  <span className="text-sm font-bold text-gray-800">{APP_CONFIG.eventInfo.location}</span>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="p-2 bg-orange-50 text-orange-500 rounded-xl">
                  <Trophy size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Modalidad</span>
                  <span className="text-sm font-bold text-gray-800">{APP_CONFIG.eventInfo.distance}</span>
                </div>
              </div>
            </div>
          </section>

          <footer className="hidden lg:block pt-4 text-left">
            <div className="flex items-center space-x-4 opacity-30 grayscale hover:grayscale-0 transition-all">
              <div className="h-[1px] flex-1 bg-gray-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Desafío El Volcán</span>
            </div>
          </footer>
        </motion.div>

        {/* RIGHT COLUMN: CONTENT AREAS */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-7"
        >
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl shadow-gray-200/50 border border-gray-50 min-h-[500px] flex flex-col">
            <AnimatePresence mode="wait">
              {currentView === 'register' && !isSubmitted && (
                <motion.form 
                  key="registration-form"
                  initial={{ opacity: 0, y: 14, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.99 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-6 text-left"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-2xl font-black tracking-tight">Formulario de Registro</h2>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Completa los datos del participante para asegurar su cupo.</p>
                      </div>
                      {!session && (
                        <button
                          type="button"
                          onClick={() => setShowLoginModal(true)}
                          className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all shadow-sm"
                        >
                          <UserIcon size={12} />
                          <span>Acceso Rápido</span>
                        </button>
                      )}
                    </div>
                    
                    {/* FULL NAME */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <UserIcon size={12} /> Nombre Completo del Atleta
                      </label>
                      <input
                        {...register('fullName')}
                        className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all ${errors.fullName ? 'ring-2 ring-red-400 bg-red-50' : ''}`}
                        placeholder="Ej. Johnny Aldana"
                      />
                      {errors.fullName && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.fullName.message}</p>}
                    </div>

                    {/* EMAIL */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <Mail size={12} /> Correo Electrónico (Para confirmación)
                      </label>
                      <input
                        {...register('email')}
                        type="email"
                        className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all ${errors.email ? 'ring-2 ring-red-400 bg-red-50' : ''}`}
                        placeholder="tu@correo.com"
                      />
                      {errors.email && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.email.message}</p>}
                    </div>

                    {/* CEDULA */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <CreditCard size={12} /> Cédula o Documento de Identidad
                      </label>
                      <input
                        {...register('cedula')}
                        className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all ${errors.cedula ? 'ring-2 ring-red-400 bg-red-50' : ''}`}
                        placeholder="V-25667889"
                      />
                      {errors.cedula && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.cedula.message}</p>}
                    </div>

                    {/* BIRTH DATE */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <Calendar size={12} /> Fecha de Nacimiento
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          {...register('birthMonth')}
                          className="bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 appearance-none"
                        >
                          <option value="">Mes</option>
                          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <select
                          {...register('birthDay')}
                          className="bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 appearance-none"
                        >
                          <option value="">Día</option>
                          {dynamicDays.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select
                          {...register('birthYear')}
                          className="bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 appearance-none"
                        >
                          <option value="">Año</option>
                          {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>

                      {(errors.birthDay || errors.birthMonth || errors.birthYear) && (
                        <p className="text-[10px] text-red-500 font-bold ml-1">
                          {errors.birthYear?.message || errors.birthDay?.message || errors.birthMonth?.message || "Fecha incompleta"}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-orange-200 transition-all flex items-center justify-center space-x-3 disabled:opacity-70 disabled:cursor-not-allowed group"
                  >
                    {isSubmitting ? (
                      <>
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        />
                        <span>PROCESANDO INSCRIPCIÓN...</span>
                      </>
                    ) : (
                      <>
                        <span>REGISTRAR INSCRIPCIÓN</span>
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                  
                  {submissionError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-3 text-left">
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs text-red-700 font-bold">
                        {submissionError}
                      </p>
                    </div>
                  )}

                  {Object.keys(errors).length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-2">
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={14} />
                      <p className="text-[10px] text-red-600 font-bold">
                        Hay errores en el formulario. Por favor revisa los campos marcados en rojo.
                      </p>
                    </div>
                  )}
                </motion.form>
              )}

              {currentView === 'register' && isSubmitted && (
                <motion.div 
                  key="success-message"
                  initial={{ opacity: 0, scale: 0.95, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -12 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center justify-center flex-1 text-center space-y-6 py-6"
                >
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                    <CheckCircle2 size={36} />
                  </div>

                  <div>
                    <h2 className="text-3xl font-black tracking-tight mb-1">¡Inscripción Exitosa!</h2>
                    <p className="text-gray-600 max-w-sm mx-auto mb-4 text-xs font-medium">
                      El participante ha sido registrado en la base de datos oficial del Desafío El Volcán.
                    </p>

                    {/* STATUS OF EMAIL NOTIFICATION */}
                    {emailDispatchResult?.participantSent ? (
                      <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 mb-4 text-xs text-emerald-900 font-bold flex items-center gap-2 text-left">
                        <Mail size={16} className="text-emerald-600 shrink-0" />
                        <span>✅ Comprobante enviado automáticamente a <strong>{lastRegistered?.email}</strong></span>
                      </div>
                    ) : (
                      <div className="bg-amber-50/90 p-3.5 rounded-2xl border border-amber-200 mb-4 text-xs text-amber-900 font-medium flex items-start gap-2.5 text-left">
                        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-bold text-amber-950">Inscripción guardada correctamente en el sistema</p>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Puedes guardar el comprobante en PDF, enviarlo por WhatsApp o copiarlo a tu correo.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* OFFICIAL TICKET / VOUCHER CARD */}
                    {lastRegistered && (
                      <div 
                        id="registration-voucher"
                        className="bg-gradient-to-br from-orange-500 to-amber-600 p-0.5 rounded-[1.75rem] shadow-xl text-left mb-5 overflow-hidden"
                      >
                        <div className="bg-white rounded-[1.65rem] p-5 space-y-3">
                          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <div>
                              <span className="text-[10px] font-black tracking-widest text-orange-600 uppercase block">Desafío El Volcán</span>
                              <span className="text-xs font-bold text-gray-400">Pase Oficial de Atleta</span>
                            </div>
                            <span className="px-2.5 py-1 bg-orange-100 text-orange-700 font-black text-[10px] uppercase rounded-full">
                              Confirmado
                            </span>
                          </div>

                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                              <span className="font-bold text-gray-400 text-[11px]">Atleta</span>
                              <span className="font-black text-gray-900 text-sm">{lastRegistered.fullName}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                              <span className="font-bold text-gray-400 text-[11px]">Cédula / Documento</span>
                              <span className="font-bold text-gray-800">{lastRegistered.cedula}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                              <span className="font-bold text-gray-400 text-[11px]">Correo</span>
                              <span className="font-medium text-gray-700">{lastRegistered.email}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                              <span className="font-bold text-gray-400 text-[11px]">Lugar & Modalidad</span>
                              <span className="font-bold text-gray-800">El Volcán • 3KM Trail</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                              <span className="font-bold text-gray-400 text-[11px]">Código de Ficha</span>
                              <span className="font-mono font-bold text-orange-600 text-xs">VOLCAN-{lastRegistered.cedula.replace(/\D/g, '').slice(-4) || '2026'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* DIRECT ACTION BUTTONS: WHATSAPP, PRINT/PDF, EMAIL */}
                    {lastRegistered && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
                        {/* 1. WHATSAPP */}
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `🏆 *COMPROBANTE DE INSCRIPCIÓN - DESAFÍO EL VOLCÁN*\n\n` +
                            `🏃 *Atleta:* ${lastRegistered.fullName}\n` +
                            `🆔 *Cédula:* ${lastRegistered.cedula}\n` +
                            `📧 *Correo:* ${lastRegistered.email}\n` +
                            `📍 *Lugar:* El Volcán, Caracas (3KM Trail Running)\n\n` +
                            `✅ *Registro confirmado exitosamente.*`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-emerald-200"
                        >
                          <MessageCircle size={15} />
                          <span>WhatsApp</span>
                        </a>

                        {/* 2. PRINT / PDF */}
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="flex items-center justify-center gap-2 p-3 bg-gray-900 hover:bg-black text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-gray-200"
                        >
                          <Printer size={15} />
                          <span>Imprimir / PDF</span>
                        </button>

                        {/* 3. MAILTO CLIENT */}
                        <a
                          href={`mailto:${lastRegistered.email}?subject=${encodeURIComponent('Comprobante de Inscripción: ' + lastRegistered.fullName + ' - Desafío El Volcán')}&body=${encodeURIComponent(
                            `🏆 DESAFÍO EL VOLCÁN - Comprobante de Inscripción\n\n` +
                            `Hola ${lastRegistered.fullName},\n\n` +
                            `Tu registro para el Desafío El Volcán ha sido confirmado:\n\n` +
                            `- Atleta: ${lastRegistered.fullName}\n` +
                            `- Cédula: ${lastRegistered.cedula}\n` +
                            `- Modalidad: 3KM Trail Running / Asfalto\n` +
                            `- Ubicación: El Volcán, Caracas\n\n` +
                            `¡Nos vemos en la carrera!`
                          )}`}
                          className="flex items-center justify-center gap-2 p-3 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-2xl text-xs font-black transition-all"
                        >
                          <Mail size={15} />
                          <span>Enviar Mail</span>
                        </a>
                      </div>
                    )}

                    {/* HELPER MODAL LINK FOR ADMIN */}
                    <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 mb-5 flex items-center justify-between text-left">
                      <div className="flex items-center gap-2">
                        <Settings size={14} className="text-gray-500" />
                        <span className="text-[11px] font-bold text-gray-700">¿Deseas activar el envío automático por Gmail?</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEmailConfigModal(true)}
                        className="text-[11px] font-black text-orange-600 hover:underline shrink-0 ml-2"
                      >
                        Ver Guía
                      </button>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-gray-700 font-bold text-xs">
                        Atención directa a participantes: <a href="https://wa.me/584142526647" target="_blank" rel="noreferrer" className="text-emerald-600 underline font-black">WhatsApp 0414-2526647</a>
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsSubmitted(false)}
                    className="py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-orange-200 transition-all"
                  >
                    Registrar a otro participante
                  </button>
                </motion.div>
              )}

              {currentView === 'history' && (
                <motion.div
                  key="history-view"
                  initial={{ opacity: 0, y: 14, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.99 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6 py-4 text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-gray-900">Mis Inscripciones</h2>
                      <p className="text-xs text-gray-500 font-medium">Registros asociados al documento {session?.idNumber}</p>
                    </div>
                    <button 
                      onClick={() => session && fetchHistory(session.idNumber)} 
                      disabled={isLoadingHistory}
                      className="p-2 text-orange-500 hover:bg-orange-50 rounded-xl transition-all active:scale-95"
                    >
                      <motion.div animate={isLoadingHistory ? { rotate: 360 } : {}} transition={{ repeat: Infinity, duration: 1 }}>
                        <Calendar size={20} />
                      </motion.div>
                    </button>
                  </div>

                  {isLoadingHistory ? (
                     <div className="py-20 flex flex-col items-center space-y-4 opacity-50">
                        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Cargando...</p>
                     </div>
                  ) : userRegistrations.length > 0 ? (
                    <div className="space-y-4">
                      {userRegistrations.map((reg) => (
                        <div key={reg.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden group">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-600 px-3 py-1 rounded-full">
                                {reg.category || 'Atleta Confirmado'}
                              </span>
                              <h3 className="text-lg font-black text-gray-900 mt-2">{reg.fullName}</h3>
                              <p className="text-xs text-gray-500 font-bold mt-0.5">Cédula: {reg.idNumber}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                Inscrito
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3.5 rounded-2xl text-gray-600">
                            <div>
                              <span className="text-[9px] font-bold uppercase text-gray-400 block">Nacimiento</span>
                              <span className="font-black text-gray-800">{reg.birthDay}/{reg.birthMonth}/{reg.birthYear}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold uppercase text-gray-400 block">Correo</span>
                              <span className="font-semibold text-gray-800 truncate block">{reg.email}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-gray-50 rounded-3xl border border-gray-100 p-8">
                      <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Trophy size={24} />
                      </div>
                      <h4 className="text-base font-black text-gray-900">No hay inscripciones registradas</h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                        Aún no tienes registros vinculados a esta cédula.
                      </p>
                      <button
                        onClick={() => setCurrentView('register')}
                        className="mt-4 px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-xs hover:bg-orange-600 transition-all shadow-md"
                      >
                        Inscribirse Ahora
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {currentView === 'contact' && (
                <motion.div
                  key="contact-view"
                  initial={{ opacity: 0, y: 14, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.99 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6 py-4 text-left"
                >
                  <div className="mb-4">
                    <h2 className="text-2xl font-black tracking-tight text-gray-900">Contacto & Organización</h2>
                    <p className="text-xs text-gray-500 font-medium">Estamos a tu disposición para cualquier información</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-4">
                      <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <MessageCircle size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-emerald-950">WhatsApp de Atención</h4>
                        <p className="text-xs text-emerald-800 mt-0.5">Consultas de atletas, grupos e inscripciones:</p>
                        <a 
                          href="https://wa.me/584142526647" 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-block mt-2 font-black text-sm text-emerald-700 bg-white px-3 py-1.5 rounded-lg border border-emerald-300 shadow-sm"
                        >
                          +58 414-2526647
                        </a>
                      </div>
                    </div>

                    <div className="p-5 bg-orange-50 rounded-2xl border border-orange-200 flex items-start gap-4">
                      <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <Mail size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-orange-950">Correo Oficial</h4>
                        <p className="text-xs text-orange-800 mt-0.5">Contacto institucional y marcas aliadas:</p>
                        <a 
                          href={`mailto:${APP_CONFIG.adminEmail}`}
                          className="inline-block mt-2 font-bold text-xs text-orange-700 bg-white px-3 py-1.5 rounded-lg border border-orange-300 shadow-sm"
                        >
                          {APP_CONFIG.adminEmail}
                        </a>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentView('register')}
                    className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl text-xs hover:bg-black transition-all"
                  >
                    Volver al Formulario
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
      )}

      {/* LOGIN MODAL */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-left"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-gray-900">Acceso Rápido</h3>
                <button 
                  onClick={() => setShowLoginModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Nombre Completo</label>
                  <input
                    value={loginForm.fullName}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                    placeholder="Ej. Johnny Aldana"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Cédula de Identidad</label>
                  <input
                    value={loginForm.idNumber}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, idNumber: e.target.value }))}
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                    placeholder="Ej. V-25667889"
                  />
                </div>
              </div>

              <button
                onClick={handleSimpleLogin}
                className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all text-xs uppercase tracking-wider shadow-lg shadow-orange-200"
              >
                Continuar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EMAIL CONFIGURATION / SETUP GUIDE MODAL */}
      <AnimatePresence>
        {showEmailConfigModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-5 text-left max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-black text-gray-900">Activar Envío Automático de Correos</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">Guía de configuración para la organización</p>
                </div>
                <button 
                  onClick={() => setShowEmailConfigModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 text-xs text-gray-600">
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-2">
                  <p className="font-bold text-orange-950 text-sm">¿Por qué no se envían los correos aún?</p>
                  <p className="text-orange-900 leading-relaxed">
                    Las aplicaciones web necesitan una conexión segura a tu cuenta de <strong>Gmail</strong> o servicio de correos para poder enviar mensajes a los participantes desde tu servidor.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="font-black text-gray-900 text-sm">Opción Recomendada: Gmail con Contraseña de Aplicación</p>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                    <li>Ingresa a tu cuenta de Google (<a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-orange-600 underline font-bold">Seguridad de Google</a>).</li>
                    <li>Activa la <strong>Verificación en 2 pasos</strong> si no la tienes activa.</li>
                    <li>Busca la sección <strong>"Contraseñas de aplicaciones"</strong> y genera una clave para "Desafío El Volcán" (es un código de 16 letras).</li>
                    <li>Ve al menú de <strong>Configuración / Secrets (Variables de entorno)</strong> de AI Studio y añade:</li>
                  </ol>

                  <div className="bg-gray-900 text-gray-100 p-3 rounded-2xl font-mono text-[11px] space-y-1 mt-2">
                    <p className="text-orange-400"># En Variables de Entorno / Secrets:</p>
                    <p>GMAIL_USER=johnnyaldanac@gmail.com</p>
                    <p>GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx</p>
                    <p>ADMIN_EMAIL=johnnyaldanac@gmail.com</p>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <p className="font-bold text-emerald-900">✅ Mientras tanto:</p>
                  <p className="text-emerald-800 text-[11px] mt-0.5">
                    Todos los registros quedan 100% guardados en la base de datos y puedes enviar los comprobantes al instante por <strong>WhatsApp</strong> o <strong>Imprimir/PDF</strong> con un solo toque.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowEmailConfigModal(false)}
                className="w-full py-3.5 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all text-xs uppercase tracking-wider shadow-lg shadow-orange-200"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN IMAGE LIGHTBOX */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 sm:top-4 sm:right-4 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur-sm transition-all z-10"
              >
                <X size={20} />
              </button>

              <div className="w-full max-h-[75vh] flex items-center justify-center overflow-hidden rounded-3xl bg-black">
                <img
                  src={selectedImage.src}
                  alt={selectedImage.caption}
                  referrerPolicy="no-referrer"
                  className="max-h-[75vh] w-auto object-contain rounded-2xl"
                />
              </div>

              <div className="w-full bg-black/60 backdrop-blur-md p-4 mt-3 rounded-2xl text-white text-center">
                <span className="inline-block px-2.5 py-0.5 bg-orange-500 text-white text-[10px] font-black uppercase rounded-full mb-1">
                  {selectedImage.tag}
                </span>
                <p className="text-sm font-bold text-gray-200">
                  {selectedImage.caption}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
