import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Calendar, 
  CreditCard, 
  Upload, 
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
  ChevronDown
} from 'lucide-react';
import { APP_CONFIG } from './config';
import { auth, googleProvider, db } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, setDoc, doc, query, where, getDocs, orderBy } from 'firebase/firestore';

// --------------------------------------------------------------------------------
// VALIDATION SCHEMA
// --------------------------------------------------------------------------------

const registrationSchema = z.object({
  fullName: z.string().min(3, 'El nombre completo es requerido'),
  email: z.string().email('Debe ser un correo electrónico válido'),
  cedula: z.string().min(6, 'Cédula muy corta'),
  birthDay: z.string().min(1, 'Día requerido'),
  birthMonth: z.string().min(1, 'Mes requerido'),
  birthYear: z.string().min(4, 'Año requerido'),
  category: z.string().min(1, 'Debes seleccionar una categoría'),
  paymentReference: z.string().min(1, 'La referencia de pago es requerida'),
  proofOfPayment: z.any()
    .refine((files) => files?.length > 0, "El comprobante de pago es obligatorio")
    .refine((files) => files?.[0]?.type.startsWith('image/'), "Debe ser una imagen (JPG, PNG, etc.)")
    .refine((files) => files?.[0]?.size <= 5000000, "La imagen no debe pesar más de 5MB")
}).refine((data) => {
  if (!data.birthDay || !data.birthMonth || !data.birthYear) return true;
  
  const birthDate = new Date(parseInt(data.birthYear), parseInt(data.birthMonth) - 1, parseInt(data.birthDay));
  const today = new Date();
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age >= 16;
}, {
  message: "Debes tener al menos 16 años para participar",
  path: ["birthYear"]
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --------------------------------------------------------------------------------
// UTILS & CONSTANTS
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
const years = Array.from({ length: 100 }, (_, i) => (currentYear - 100 + i + 1).toString()).reverse();

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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'register' | 'about' | 'contact' | 'history'>('register');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userRegistrations, setUserRegistrations] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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

  // Fetch History by ID Number
  const fetchHistory = async (idNumber: string) => {
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'registrations'), 
        where('idNumber', '==', idNumber),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const regs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUserRegistrations(regs);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const watchMonth = watch('birthMonth');
  const watchYear = watch('birthYear');
  const watchDay = watch('birthDay');

  // Calculate days based on month and year
  const getDaysInMonth = (month: string, year: string) => {
    if (!month) return 31;
    const m = parseInt(month);
    const y = year ? parseInt(year) : 2000; // Default year for leap year check if not selected
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
      const newSession = { fullName: loginForm.fullName, idNumber: loginForm.idNumber };
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
    
    try {
      // 1. Prepare data for Firestore
      const registrationData = {
        fullName: data.fullName,
        email: data.email,
        idNumber: data.cedula,
        birthDay: data.birthDay,
        birthMonth: data.birthMonth,
        birthYear: data.birthYear,
        category: data.category,
        paymentReference: data.paymentReference,
        userId: session?.idNumber || 'anonymous',
        createdAt: serverTimestamp(),
        // Add status for tracking
        status: 'pending'
      };

      // 2. Save to Firestore
      try {
        await addDoc(collection(db, 'registrations'), registrationData);
      } catch (fsError) {
        handleFirestoreError(fsError, OperationType.CREATE, 'registrations');
      }

      // 3. (Optional) Also send to backend if needed (legacy)
      const formData = new FormData();
      formData.append('fullName', data.fullName);
      formData.append('email', data.email);
      formData.append('cedula', data.cedula);
      formData.append('birthDay', data.birthDay);
      formData.append('birthMonth', data.birthMonth);
      formData.append('birthYear', data.birthYear);
      formData.append('category', data.category);
      formData.append('paymentReference', data.paymentReference);
      
      if (data.proofOfPayment?.[0]) {
        formData.append('proofOfPayment', data.proofOfPayment[0]);
      }

      // We still hit the backend to handle the image upload/email
      const response = await fetch('/api/register', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al procesar la inscripción en el servidor');
      }

      setIsSubmitted(true);
      reset(); // Clear form
      setImagePreview(null);
      if (session) fetchHistory(session.idNumber); // Refresh history
    } catch (error) {
      console.error('Registration Error:', error);
      alert(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
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
              Únete a la experiencia de running más grande del año. Regístrate ahora y asegura tu kit oficial.
            </p>
          </header>

          {/* PAYMENT INFO BOX */}
          <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 opacity-50" />
            <h3 className="text-lg font-bold flex items-center space-x-2 mb-1 relative z-10">
              <CreditCard className="text-orange-500" />
              <span>Datos de Pago</span>
            </h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-4 relative z-10">
              a tasa bcv del dia
            </p>
            <div className="space-y-4 relative z-10">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Banco</span>
                <span className="text-md font-bold">{APP_CONFIG.paymentInfo.banco}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Cédula</span>
                  <span className="text-md font-bold">{APP_CONFIG.paymentInfo.cedula}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Pago Móvil</span>
                  <span className="text-md font-bold">{APP_CONFIG.paymentInfo.celular}</span>
                </div>
              </div>
              <div className="pt-2 flex items-start space-x-2 text-xs text-blue-600 bg-blue-50 p-3 rounded-xl border border-blue-100">
                <Info size={14} className="mt-0.5 shrink-0" />
                <p>Realice su pago antes de llenar el formulario para adjuntar el comprobante.</p>
              </div>
            </div>
          </section>

          <footer className="hidden lg:block pt-4">
            <div className="flex items-center space-x-4 opacity-30 grayscale hover:grayscale-0 transition-all">
              <div className="h-[1px] flex-1 bg-gray-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Patrocinado por Runners.co</span>
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
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl shadow-gray-200/50 border border-gray-50 min-h-[600px] flex flex-col">
            <AnimatePresence mode="wait">
              {currentView === 'register' && !isSubmitted && (
                <motion.form 
                  key="registration-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-black tracking-tight">Formulario de Registro</h2>
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
                        <UserIcon size={12} /> Nombre Completo
                      </label>
                      <input
                        {...register('fullName')}
                        className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all ${errors.fullName ? 'ring-2 ring-red-400 bg-red-50' : ''}`}
                        placeholder="Juan Pérez"
                      />
                      {errors.fullName && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.fullName.message}</p>}
                    </div>

                    {/* EMAIL */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <UserIcon size={12} /> Correo Electrónico
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
                        <CreditCard size={12} /> Cédula de Identidad
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

                    {/* CATEGORY */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <Trophy size={12} /> Categoría
                      </label>
                      <select
                        {...register('category')}
                        className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 appearance-none transition-all ${errors.category ? 'ring-2 ring-red-400 bg-red-50' : ''}`}
                      >
                        <option value="">Selecciona tu categoría</option>
                        {APP_CONFIG.categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      {errors.category && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.category.message}</p>}
                    </div>

                    {/* PAYMENT REFERENCE */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <CheckCircle2 size={12} /> Referencia Bancaria
                      </label>
                      <input
                        {...register('paymentReference')}
                        className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all ${errors.paymentReference ? 'ring-2 ring-red-400 bg-red-50' : ''}`}
                        placeholder="Últimos 4 o 6 dígitos de la transferencia"
                      />
                      {errors.paymentReference && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.paymentReference.message}</p>}
                    </div>

                    {/* PROOF OF PAYMENT */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <Upload size={12} /> Comprobante de Pago
                      </label>
                      <div className="relative group">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          {...register('proofOfPayment')}
                          onChange={(e) => {
                            register('proofOfPayment').onChange(e);
                            handleImageChange(e);
                          }}
                        />
                        <div className={`w-full border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center space-y-2 transition-all ${errors.proofOfPayment ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 group-hover:bg-gray-100 group-hover:border-orange-300'}`}>
                          {imagePreview ? (
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden">
                              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-white text-xs font-bold uppercase">Cambiar Imagen</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="p-3 bg-white rounded-2xl shadow-sm text-gray-400 group-hover:text-orange-500 transition-colors">
                                <Upload size={24} />
                              </div>
                              <span className="text-sm font-bold text-gray-500">Subir Captura/Foto</span>
                              <span className="text-[10px] text-gray-400">JPG, PNG hasta 5MB</span>
                            </>
                          )}
                        </div>
                      </div>
                      {errors.proofOfPayment && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.proofOfPayment.message as string}</p>}
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
                          <span>PROCESANDO...</span>
                        </>
                      ) : (
                        <>
                          <span>REGISTRAR INSCRIPCIÓN</span>
                          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                    
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
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center flex-1 text-center space-y-6 py-10"
                >
                  <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center shadow-inner">
                    <CheckCircle2 size={48} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tight mb-2">¡Inscripción Recibida!</h2>
                    <p className="text-gray-500 max-w-sm mx-auto mb-4">
                      Tu registro ha sido enviado con éxito. Validaremos tu pago en las próximas 24 horas y te enviaremos un correo de confirmación.
                    </p>
                    <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 mb-6">
                      <p className="text-orange-700 font-bold text-sm">
                        Si no recibe respuesta en las próximas 72 horas escriba al número <span className="whitespace-nowrap">0414-2526647</span>
                      </p>
                    </div>

                    {/* SOCIAL SHARING */}
                    <div className="space-y-4">
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">¡Comparte con tus amigos!</p>
                      <div className="flex items-center justify-center space-x-3">
                        <a 
                          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-3 bg-blue-600 text-white rounded-2xl hover:scale-110 transition-transform shadow-lg shadow-blue-200"
                          title="Compartir en Facebook"
                        >
                          <Facebook size={20} />
                        </a>
                        <a 
                          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent('¡Me acabo de inscribir en el Desafío El Volcán! Únete a la carrera aquí:')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-3 bg-black text-white rounded-2xl hover:scale-110 transition-transform shadow-lg shadow-gray-200"
                          title="Compartir en X (Twitter)"
                        >
                          <Twitter size={20} />
                        </a>
                        <a 
                          href={`https://wa.me/?text=${encodeURIComponent('¡Me acabo de inscribir en el Desafío El Volcán! Únete a la carrera aquí: ' + window.location.origin)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-3 bg-green-500 text-white rounded-2xl hover:scale-110 transition-transform shadow-lg shadow-green-200"
                          title="Compartir en WhatsApp"
                        >
                          <MessageCircle size={20} />
                        </a>
                        <button 
                          onClick={() => {
                            navigator.share?.({
                              title: 'Desafío El Volcán',
                              text: '¡Me acabo de inscribir en el Desafío El Volcán!',
                              url: window.location.origin
                            }).catch(() => {
                              navigator.clipboard.writeText(window.location.origin);
                              alert('Enlace copiado al portapapeles');
                            });
                          }}
                          className="p-3 bg-orange-100 text-orange-600 rounded-2xl hover:scale-110 transition-transform"
                          title="Más opciones de compartido"
                        >
                          <Share2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsSubmitted(false)}
                    className="text-orange-500 font-bold hover:underline"
                  >
                    Registrar a otra persona
                  </button>
                </motion.div>
              )}

              {currentView === 'history' && (
                <motion.div
                  key="history-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 py-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-black tracking-tight text-gray-900">Mis Inscripciones</h2>
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
                          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-50 transition-opacity" />
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 text-left">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                  {reg.category}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400">
                                  {reg.createdAt?.toDate().toLocaleDateString('es-VE')}
                                </span>
                              </div>
                              <h4 className="text-xl font-black text-gray-900 capitalize">{reg.fullName}</h4>
                              <p className="text-xs font-bold text-gray-500">{reg.idNumber}</p>
                            </div>
                            <div className="flex items-center space-x-3">
                              <div className="flex flex-col items-end">
                                <div className="flex items-center space-x-1.5 text-green-500 font-bold text-xs">
                                  <CheckCircle2 size={12} />
                                  <span>Recibida</span>
                                </div>
                                <span className="text-[10px] text-gray-400 font-medium">Ref: {reg.paymentReference}</span>
                              </div>
                              <ChevronRight className="text-gray-300" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 py-16 rounded-[3rem] border-2 border-dashed border-gray-200 flex flex-col items-center text-center px-6">
                      <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-gray-200 mb-4 shadow-sm">
                        <Trophy size={32} />
                      </div>
                      <h3 className="text-lg font-black text-gray-900 mb-1">Sin inscripciones</h3>
                      <p className="text-gray-400 text-xs font-medium max-w-[200px] mb-6">
                        Aún no has registrado ninguna participación para este evento.
                      </p>
                      <button 
                        onClick={() => setCurrentView('register')}
                        className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-orange-100 hover:scale-105 active:scale-95 transition-all"
                      >
                        Inscribirme Ahora
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {currentView === 'about' && (
                <motion.div 
                  key="about-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8 py-4"
                >
                  <h2 className="text-4xl font-black">¿Quiénes somos?</h2>
                  <div className="space-y-4 text-gray-500 font-medium text-lg leading-relaxed">
                    <p>
                      Desafío El Volcán es más que una carrera; es una comunidad de corredores apasionados que buscan superar sus límites.
                    </p>
                    <p>
                      Nuestra misión es fomentar el deporte y la salud a través de eventos de alta calidad técnica y humana.
                    </p>
                    <div className="p-8 bg-gray-50 rounded-3xl border border-dashed border-gray-200 text-center">
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Próximamente</p>
                      <p className="text-gray-400">Más información sobre nuestra historia y equipo.</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentView === 'contact' && (
                <motion.div 
                  key="contact-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8 py-4 px-2"
                >
                  <h2 className="text-4xl font-black">Contacto</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-orange-50 p-8 rounded-[2rem] border border-orange-100 flex flex-col items-center text-center space-y-4">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-orange-500">
                        <AlertCircle size={32} />
                      </div>
                      <div>
                        <h4 className="font-black text-orange-900">WhatsApp / Soporte</h4>
                        <p className="text-orange-700 font-bold mt-1">0414-2526647</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100 flex flex-col items-center text-center space-y-4">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-gray-400">
                         <UserIcon size={32} />
                      </div>
                      <div>
                        <h4 className="font-black text-gray-900">Correo Electrónico</h4>
                        <p className="text-gray-500 font-bold mt-1">{APP_CONFIG.adminEmail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-8 bg-white border border-gray-100 rounded-3xl shadow-sm text-center">
                    <p className="text-gray-500">Estamos disponibles para resolver cualquier duda sobre tu inscripción.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* GLOBAL FOOTER MESSAGE */}
      <div className="max-w-4xl mx-auto text-center py-8">
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
          Si no recibe respuesta en las próximas 72 horas escriba al número <span className="text-orange-500">0414-2526647</span>
        </p>
      </div>

      {/* LOGIN MODAL */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowLoginModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-8 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-orange-100 rounded-3xl flex items-center justify-center text-orange-500 mb-2">
                <UserIcon size={32} />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-gray-900 leading-tight">Acceso Rápido</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Vincula tu historial</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Nombre Completo</label>
                  <input 
                    type="text" 
                    placeholder="Tu nombre aquí"
                    value={loginForm.fullName}
                    onChange={e => setLoginForm({...loginForm, fullName: e.target.value})}
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-2xl p-4 text-sm font-bold transition-all outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Número de Cédula</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 12345678"
                    value={loginForm.idNumber}
                    onChange={e => setLoginForm({...loginForm, idNumber: e.target.value})}
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-2xl p-4 text-sm font-bold transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleSimpleLogin}
                  disabled={!loginForm.fullName || !loginForm.idNumber}
                  className="w-full bg-orange-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-orange-100 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
                >
                  CONTINUAR
                </button>
                <button 
                  onClick={() => setShowLoginModal(false)}
                  className="w-full text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
                >
                  CANCELAR
                </button>
              </div>

              <div className="pt-4 border-t border-gray-50 flex items-center justify-center space-x-2 text-[8px] font-bold text-gray-300 uppercase tracking-[0.2em]">
                <CheckCircle2 size={10} />
                <span>Seguridad Verificada</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
