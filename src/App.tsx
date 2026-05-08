import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Calendar, 
  CreditCard, 
  Upload, 
  User, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Info,
  Facebook,
  Twitter,
  MessageCircle,
  Share2
} from 'lucide-react';
import { APP_CONFIG } from './config';

// --------------------------------------------------------------------------------
// VALIDATION SCHEMA
// --------------------------------------------------------------------------------

const registrationSchema = z.object({
  fullName: z.string().min(3, 'El nombre completo es requerido'),
  email: z.string().email('Debe ser un correo electrónico válido'),
  cedula: z.string().regex(/^[0-9]+$/, 'La cédula debe contener solo números').min(6, 'Cédula muy corta'),
  birthDay: z.string().min(1, 'Día requerido'),
  birthMonth: z.string().min(1, 'Mes requerido'),
  birthYear: z.string().min(4, 'Año requerido'),
  category: z.string().min(1, 'Debes seleccionar una categoría'),
  proofOfPayment: z.any()
    .refine((files) => files?.length > 0, "El comprobante de pago es obligatorio")
    .refine((files) => files?.[0]?.type.startsWith('image/'), "Debe ser una imagen (JPG, PNG, etc.)")
    .refine((files) => files?.[0]?.size <= 5000000, "La imagen no debe pesar más de 5MB")
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

// --------------------------------------------------------------------------------
// UTILS & CONSTANTS
// --------------------------------------------------------------------------------

const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'register' | 'about' | 'contact'>('register');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema)
  });

  const onSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('fullName', data.fullName);
      formData.append('email', data.email);
      formData.append('cedula', data.cedula);
      formData.append('birthDay', data.birthDay);
      formData.append('birthMonth', data.birthMonth);
      formData.append('birthYear', data.birthYear);
      formData.append('category', data.category);
      
      if (data.proofOfPayment?.[0]) {
        formData.append('proofOfPayment', data.proofOfPayment[0]);
      }

      const response = await fetch('/api/register', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Error al registrar. Por favor intenta de nuevo.');
      }

      setIsSubmitted(true);
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
                { id: 'about', label: '¿Quiénes somos?', icon: Info },
                { id: 'contact', label: 'Contacto', icon: User }
              ].map((item) => (
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
              ))}
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
            <h3 className="text-lg font-bold flex items-center space-x-2 mb-4 relative z-10">
              <CreditCard className="text-orange-500" />
              <span>Datos de Pago</span>
            </h3>
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
                    <h2 className="text-2xl font-black tracking-tight mb-6">Formulario de Registro</h2>
                    
                    {/* FULL NAME */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <User size={12} /> Nombre Completo
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
                        <User size={12} /> Correo Electrónico
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
                          {days.map(d => <option key={d} value={d}>{d}</option>)}
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
                        <p className="text-[10px] text-red-500 font-bold ml-1">Fecha incompleta</p>
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
                         <User size={32} />
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
    </div>
  );
}
