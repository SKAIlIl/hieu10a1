import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Camera, Package, Search, Trash2, AlertTriangle, CheckCircle2, 
  Loader2, RefreshCw, RotateCw, Bell, Phone, Info, Filter, X, 
  Clock, Calendar, ShieldAlert, Pill, ChevronRight, Settings, 
  User, PhoneCall, CheckSquare, Square, LayoutDashboard, Plus,
  Layers, Save, BookOpen, HeartPulse, MoreVertical, ChevronDown,
  MessageSquare, Send, Paperclip, Mic, MicOff, Image as ImageIcon,
  Stethoscope, AlertCircle, Zap, ZoomIn, ZoomOut, Upload, Folder,
  Check, ListChecks, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Config ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// --- Gemini Config ---
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// --- Types ---
interface Medicine {
  id: number;
  name: string;
  usage: string;
  expiry_date: string;
  recommended_shelf_life: string;
  simple_instructions: string;
  interaction_warning: string;
  disposal_tip: string;
  category: string;
  is_taken: boolean;
  scanned_at: string;
  user_id?: string;
}

interface MedicineGroup {
  id: number;
  name: string;
  purpose: string;
  ai_schedule: string;
  items: Medicine[];
  created_at: string;
  user_id?: string;
}

interface AnalysisResult {
  name: string;
  usage: string;
  expiry_date: string;
  recommended_shelf_life: string;
  simple_instructions: string;
  interaction_warning: string;
  disposal_tip: string;
  category: string;
}

interface ChatMessage {
  id?: number;
  role: 'user' | 'model';
  content: string;
  timestamp?: string;
  user_id?: string;
}

interface AppSettings {
  emergency_name?: string;
  emergency_phone?: string;
}

interface AdherenceRecord {
  id?: number;
  item_id: number;
  type: 'medicine' | 'group';
  time_slot: string;
  date: string;
  status: number;
  user_id?: string;
}

// --- AI System Instruction ---
const AI_SYSTEM_INSTRUCTION = `Role: Bạn là "Trợ lý Y tế MedGuard" - Một bác sĩ ảo chuyên nghiệp, thấu cảm và cực kỳ cẩn trọng.

QUY TẮC AN TOÀN BẮT BUỘC:
1. KHÔNG KÊ ĐƠN: Bạn không phải bác sĩ thật. Luôn dùng các cụm từ như "Thông tin tra cứu cho thấy..." hoặc "Dựa trên hướng dẫn sử dụng...".
2. CẢNH BÁO TƯƠNG TÁC: Khi người dùng hỏi về thuốc hoặc quét thuốc mới, bạn PHẢI đối chiếu với danh sách thuốc hiện có trong tủ thuốc của họ để cảnh báo các tương tác nguy hiểm.
3. CHẾ ĐỘ PHÂN TÍCH (QUÉT THUỐC): 
   - CHỈ trả về: Tên thuốc | Hướng dẫn ngắn gọn | Cảnh báo nguy cơ & Tương tác | Hạn sử dụng | Nhóm thuốc.
   - KHÔNG chào hỏi, không giải thích dài dòng.
   - Nếu ảnh mờ: "❌ KHÔNG THỂ XÁC ĐỊNH. Hình ảnh bị mờ hoặc không rõ ràng. Vui lòng chụp lại."
4. CHẾ ĐỘ DỊCH THUẬT (DỊCH THUỐC):
   - Dịch TOÀN BỘ nội dung trong ảnh (Thành phần, Nhãn hiệu, Chú thích) sang tiếng Việt thuần túy.
   - Trả về bản tóm tắt trực tiếp. KHÔNG chào hỏi.
5. PHÂN TÍCH GÓI THUỐC: CHỈ trả về: Tên thuốc, Giờ uống, Thời điểm (Trước/Sau ăn). KHÔNG chào hỏi.
6. GIAO THỨC KHẨN CẤP: Nếu phát hiện dấu hiệu nguy hiểm (đau ngực, khó thở), yêu cầu người dùng nhấn nút SOS ngay lập tức.
7. MIỄN TRỪ TRÁCH NHIỆM: Mọi câu trả lời phải kết thúc bằng: "Lưu ý: Thông tin chỉ mang tính tham khảo, hãy hỏi ý kiến bác sĩ chuyên khoa."`;

// --- Components ---
const MedicineCard: React.FC<{ 
  item: Medicine; 
  onToggleTaken?: (id: number, status: boolean) => void;
  onDelete?: (id: number) => void;
  onAskAI?: (item: Medicine) => void;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
}> = ({ item, onToggleTaken, onDelete, onAskAI, compact, selectable, selected, onSelect }) => {
  const calculateDaysRemaining = (expiryDate: string) => {
    if (!expiryDate || expiryDate === 'N/A' || expiryDate === 'KHÔNG RÕ') return Infinity;
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = calculateDaysRemaining(item.expiry_date);
  const isExpiringSoon = daysLeft < 7;
  const isExpired = daysLeft <= 0;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      onClick={() => selectable && onSelect && onSelect(item.id)}
      className={`bg-white p-5 rounded-[24px] shadow-sm border transition-all cursor-pointer ${
        selected ? 'border-emerald-500 ring-4 ring-emerald-500/10' : 'border-slate-100'
      } ${isExpired ? 'border-red-200 bg-red-50/50' : isExpiringSoon ? 'border-amber-200 bg-amber-50/30' : ''}`}
    >
      <div className="flex items-start gap-4">
        {selectable ? (
          <div className={`shrink-0 mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selected ? 'bg-emerald-600 border-emerald-600 text-white scale-110' : 'border-slate-300'}`}>
            {selected && <Check className="w-4 h-4" />}
          </div>
        ) : onToggleTaken && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleTaken(item.id, item.is_taken); }}
            className={`shrink-0 mt-1 transition-all hover:scale-110 ${item.is_taken ? 'text-emerald-600' : 'text-slate-300'}`}
          >
            {item.is_taken ? <CheckCircle2 className="w-6 h-6 fill-emerald-50" /> : <Square className="w-6 h-6" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
              isExpired ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'
            }`}>{item.category}</span>
            <div className="flex items-center gap-1">
              {!selectable && onAskAI && (
                <button onClick={(e) => { e.stopPropagation(); onAskAI(item); }} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}
              {!selectable && onDelete && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <h4 className={`text-base font-bold text-slate-900 mb-1 leading-tight ${item.is_taken ? 'line-through opacity-50' : ''}`}>{item.name}</h4>
          {!compact && <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">{item.simple_instructions}</p>}
          
          <div className="flex flex-wrap gap-2">
            <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              isExpired ? 'bg-red-50 text-red-600 border-red-100' : isExpiringSoon ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-100'
            }`}>
              <Clock className="w-3 h-3" />
              {isExpired ? 'ĐÃ HẾT HẠN' : `HSD: ${item.expiry_date}`}
            </div>
            {item.interaction_warning && item.interaction_warning !== 'N/A' && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                <AlertTriangle className="w-3 h-3" />
                Cảnh báo
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  // --- App State ---
  const [activeTab, setActiveTab] = useState<'scan' | 'inventory' | 'groups' | 'chat' | 'schedule'>('scan');
  const [inventory, setInventory] = useState<Medicine[]>([]);
  const [groups, setGroups] = useState<MedicineGroup[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [basket, setBasket] = useState<AnalysisResult[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [adherence, setAdherence] = useState<AdherenceRecord[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  
  const [showSOS, setShowSOS] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [isWide, setIsWide] = useState(window.innerWidth >= 1200);

  const [groupForm, setGroupForm] = useState({ name: '', purpose: '' });
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isAnalyzingGroup, setIsAnalyzingGroup] = useState(false);
  const [selectedMedicineForChat, setSelectedMedicineForChat] = useState<Medicine | null>(null);
  const [scanMode, setScanMode] = useState<'medicine' | 'symptom' | 'translate'>('medicine');
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  const [isListening, setIsListening] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isStartingCamera = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Auth Logic ---
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent, isSignUp: boolean) => {
    e.preventDefault();
    if (!supabase) return;
    if (!email || !password) {
      showToast("Vui lòng nhập Email và Mật khẩu", "warning");
      return;
    }
    setIsLoginLoading(true);
    try {
      const { error } = isSignUp 
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      
      if (error) throw error;
      if (isSignUp) showToast("Đăng ký thành công! Hãy kiểm tra Email (nếu yêu cầu)", "success");
      else showToast("Đăng nhập thành công!", "success");
    } catch (error: any) {
      showToast(error.message, "error");
    } finally {
      setIsLoginLoading(false);
    }
  };

  // --- API Calls (Supabase) ---
  const fetchData = useCallback(async () => {
    if (!supabase || !user) return; // Bắt buộc phải có user mới tải dữ liệu
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [
        { data: inv },
        { data: groupsData },
        { data: chat },
        { data: settingsData },
        { data: adherenceData }
      ] = await Promise.all([
        supabase.from('medicines').select('*').eq('user_id', user.id).order('scanned_at', { ascending: false }),
        supabase.from('medicine_groups').select('*, items:medicines(*)').eq('user_id', user.id),
        supabase.from('chat_history').select('*').eq('user_id', user.id).order('timestamp', { ascending: true }),
        supabase.from('app_settings').select('*').eq('user_id', user.id).single(),
        supabase.from('adherence_records').select('*').eq('user_id', user.id).eq('date', today)
      ]);

      if (inv) setInventory(inv);
      if (groupsData) setGroups(groupsData);
      if (chat) setChatHistory(chat);
      if (settingsData) setSettings(settingsData);
      if (adherenceData) setAdherence(adherenceData);
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Lỗi đồng bộ dữ liệu", "error");
    }
  }, [user, showToast]);

  // --- Camera Logic ---
  const startCamera = useCallback(async () => {
    if (isStartingCamera.current) return;
    isStartingCamera.current = true;
    
    try {
      if (videoRef.current?.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach(track => {
          track.stop();
        });
        videoRef.current.srcObject = null;
      }
      
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log("Available devices:", devices.length);
      } catch (e) {
        console.warn("Error enumerating devices:", e);
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const constraints: MediaStreamConstraints = {
        video: isDesktop ? true : {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(e => console.warn("Play failed", e));
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play().catch(e => console.warn("Fallback play failed", e));
          setIsCameraActive(true);
        }
      } catch (fallbackErr) {
        console.error("Fallback camera access failed:", fallbackErr);
        setIsCameraActive(false);
        showToast("Không thể khởi động camera. Hãy đảm bảo bạn đã cấp quyền và không có ứng dụng khác đang dùng camera.", "error");
      }
    } finally {
      isStartingCamera.current = false;
    }
  }, [facingMode, isDesktop, showToast]);

  // --- Speech Recognition ---
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Error stopping recognition:", e);
        }
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'vi-VN';
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (activeTab === 'chat') {
          setChatInput(prev => prev + transcript);
        } else {
          setSearchQuery(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        console.error("Speech recognition error:", event.error);
        
        switch (event.error) {
          case 'not-allowed':
            showToast("Vui lòng cấp quyền Microphone để sử dụng tính năng này", "error");
            break;
          case 'no-speech':
            showToast("Bạn chưa nói gì, hãy thử lại nhé", "warning");
            break;
          case 'network':
            showToast("Lỗi kết nối mạng khi nhận diện giọng nói", "error");
            break;
          default:
            showToast(`Lỗi nhận diện: ${event.error}`, "error");
        }
      };

      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Error stopping recognition:", e);
        }
      }
    };
  }, [activeTab, fetchData, showToast]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      showToast("Trình duyệt không hỗ trợ giọng nói", "warning");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
      setIsWide(window.innerWidth >= 1200);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fetchData, user]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab]);

  useEffect(() => {
    const currentVideo = videoRef.current;
    if (user && activeTab === 'scan' && !capturedImage) {
      startCamera();
    }
    return () => {
      if (currentVideo?.srcObject) {
        (currentVideo.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      setIsCameraActive(false);
    };
  }, [activeTab, capturedImage, facingMode, startCamera, user]);

  const applyCameraConstraints = async (constraints: any) => {
    const stream = videoRef.current?.srcObject as MediaStream;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track && track.applyConstraints) {
        try {
          await track.applyConstraints({ advanced: [constraints] });
        } catch (e) {
          console.warn("Constraints not supported", e);
        }
      }
    }
  };

  useEffect(() => {
    applyCameraConstraints({ zoom: zoomLevel });
  }, [zoomLevel]);

  useEffect(() => {
    applyCameraConstraints({ torch: isFlashOn });
  }, [isFlashOn]);

  const capturePhoto = () => {
    if (!isCameraActive || !videoRef.current || !canvasRef.current) {
      showToast("Camera chưa sẵn sàng", "warning");
      return;
    }
    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      setCapturedImage(canvasRef.current.toDataURL('image/jpeg'));
      if (videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      setIsCameraActive(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
        if (videoRef.current?.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
        setIsCameraActive(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- AI Logic ---

  const analyzeMedicine = async (customName?: string, editedText?: string) => {
    if (!ai) {
      showToast("Thiếu Gemini API Key", "error");
      return;
    }
    if (!capturedImage && !customName && !editedText) return;
    setIsAnalyzing(true);
    setTranslatedText(null);
    
    try {
      const currentDate = new Date().toISOString().split('T')[0];
      const inventoryContext = inventory.map(i => `${i.name}: ${i.usage}`).join(', ');
      
      let prompt = "";
      let parts: any[] = [];

      if (scanMode === 'symptom') {
        const base64Data = capturedImage!.split(',')[1];
        prompt = `Phân tích triệu chứng y tế từ hình ảnh. Trả về Markdown tiếng Việt chuyên nghiệp.`;
        parts = [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: prompt }
        ];
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: { parts },
          config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
        });

        const modelMsg: ChatMessage = { role: 'model', content: response.text || "Không thể phân tích." };
        setChatHistory(prev => [...prev, { role: 'user', content: "[Ảnh triệu chứng]" }, modelMsg]);
        
        if (supabase && user) {
          await supabase.from('chat_history').insert([
            { role: 'user', content: "[Ảnh triệu chứng]", user_id: user.id },
            { ...modelMsg, user_id: user.id }
          ]);
        }
        
        setActiveTab('chat');
        setCapturedImage(null);
        return;
      }

      if (scanMode === 'translate') {
        const base64Data = capturedImage!.split(',')[1];
        prompt = `Dịch toàn bộ nội dung trong ảnh (Thành phần, Nhãn hiệu, Chú thích) sang tiếng Việt. Trả về bản tóm tắt trực tiếp. KHÔNG chào hỏi.`;
        parts = [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: prompt }
        ];
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: { parts },
          config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
        });

        setTranslatedText(response.text || "Không thể dịch.");
        setIsAnalyzing(false);
        return;
      }

      if (editedText) {
        prompt = `Cập nhật hướng dẫn cho thuốc dựa trên thông tin mới: "${editedText}". Tủ thuốc hiện tại: ${inventoryContext}. Ngày: ${currentDate}.
YÊU CẦU ĐỊNH DẠNG NGHIÊM NGẶT (Trả về 1 dòng duy nhất, phân cách bằng dấu |):
Tên thuốc | Hướng dẫn ngắn gọn | Cảnh báo nguy cơ & Tương tác | Hạn sử dụng (YYYY-MM-DD hoặc "Xem trên vỉ thuốc") | Nhóm thuốc`;
        parts = [{ text: prompt }];
      } else if (customName) {
        prompt = `Tra cứu thuốc: ${customName}. Tủ thuốc hiện tại: ${inventoryContext}. Ngày: ${currentDate}.
YÊU CẦU ĐỊNH DẠNG NGHIÊM NGẶT (Trả về 1 dòng duy nhất, phân cách bằng dấu |):
Tên thuốc | Hướng dẫn ngắn gọn | Cảnh báo nguy cơ & Tương tác | Hạn sử dụng (YYYY-MM-DD hoặc "Xem trên vỉ thuốc") | Nhóm thuốc`;
        parts = [{ text: prompt }];
      } else {
        const base64Data = capturedImage!.split(',')[1];
        prompt = `Phân tích ảnh thuốc này. Tủ thuốc hiện tại: ${inventoryContext}. Ngày: ${currentDate}.
Nếu ảnh mờ, hãy trả về thông báo lỗi theo quy tắc.
Nếu rõ ràng, YÊU CẦU ĐỊNH DẠNG NGHIÊM NGẶT (Trả về 1 dòng duy nhất, phân cách bằng dấu |):
Tên thuốc | Hướng dẫn ngắn gọn | Cảnh báo nguy cơ & Tương tác | Hạn sử dụng (YYYY-MM-DD hoặc "Xem trên vỉ thuốc") | Nhóm thuốc`;
        parts = [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: prompt }
        ];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
      });

      const text = response.text || "";
      if (text.includes("KHÔNG THỂ XÁC ĐỊNH")) {
        showToast(text, "warning");
        setCapturedImage(null);
        return;
      }

      const resultParts = text.split('|').map(p => p.trim());
      if (resultParts.length >= 5) {
        setAnalysisResult({
          name: resultParts[0],
          usage: resultParts[1],
          expiry_date: resultParts[3],
          simple_instructions: resultParts[1],
          interaction_warning: resultParts[2],
          disposal_tip: "N/A",
          category: resultParts[4],
          recommended_shelf_life: resultParts[3] === 'Xem trên vỉ thuốc' ? '6 tháng từ ngày quét' : ''
        });
      }
    } catch (error) {
      showToast("Lỗi phân tích AI", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ai) {
      showToast("Thiếu Gemini API Key", "error");
      return;
    }
    if (!chatInput.trim() && !selectedMedicineForChat) return;

    const userMessage = selectedMedicineForChat 
      ? `[Thuốc: ${selectedMedicineForChat.name}] ${chatInput}`
      : chatInput;
    
    const newUserMsg: ChatMessage = { role: 'user', content: userMessage };
    setChatHistory(prev => [...prev, newUserMsg]);
    setChatInput('');
    setSelectedMedicineForChat(null);
    setIsSendingChat(true);

    try {
      if (supabase && user) {
        await supabase.from('chat_history').insert([{ ...newUserMsg, user_id: user.id }]);
      }

      const inventoryContext = inventory.map(i => `${i.name}: ${i.usage}`).join('\n');
      const fullPrompt = `Tủ thuốc:\n${inventoryContext}\n\nLịch sử:\n${chatHistory.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n')}\nuser: ${userMessage}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: fullPrompt,
        config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
      });

      const modelMsg: ChatMessage = { role: 'model', content: response.text || "Xin lỗi, tôi không thể trả lời." };
      setChatHistory(prev => [...prev, modelMsg]);
      
      if (supabase && user) {
        await supabase.from('chat_history').insert([{ ...modelMsg, user_id: user.id }]);
      }
    } catch (error) {
      showToast("Lỗi gửi tin nhắn", "error");
    } finally {
      setIsSendingChat(false);
    }
  };

  const createGroupFromSelection = async () => {
    if (!ai || !supabase || !user) {
      showToast("Thiếu cấu hình API hoặc chưa đăng nhập", "error");
      return;
    }
    if (selectedIds.length === 0 || !groupForm.name) return;
    setIsAnalyzingGroup(true);

    try {
      const selectedMeds = inventory.filter(i => selectedIds.includes(i.id));
      const medList = selectedMeds.map(b => `${b.name} (${b.usage})`).join(', ');
      const prompt = `Lập lịch trình uống thuốc AN TOÀN cho gói "${groupForm.name}" gồm các loại thuốc sau: ${medList}. 
      
      NHIỆM VỤ QUAN TRỌNG:
      1. Phân tích các tương tác thuốc có thể xảy ra giữa các loại thuốc này.
      2. Đưa ra lịch trình uống thuốc tối ưu để tránh tình trạng "sốc thuốc" hoặc phản ứng phụ nguy hiểm.
      3. Chia rõ các mốc thời gian: Sáng, Trưa, Chiều, Tối.
      4. Chỉ định rõ thời điểm uống (Trước ăn, Sau ăn, hoặc cách nhau bao lâu).
      5. Nếu có cặp thuốc nào TUYỆT ĐỐI không được uống cùng nhau, hãy đưa ra cảnh báo cực kỳ rõ ràng ở đầu bản tin.

      YÊU CẦU ĐỊNH DẠNG: Trả về Markdown tiếng Việt chuyên nghiệp. KHÔNG chào hỏi.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
      });

      const { data: groupData, error: groupError } = await supabase.from('medicine_groups').insert([{
        name: groupForm.name,
        purpose: groupForm.purpose,
        ai_schedule: response.text,
        user_id: user.id
      }]).select().single();

      if (groupError) throw groupError;

      const groupItems = selectedIds.map(id => ({
        group_id: groupData.id,
        medicine_id: id
      }));

      await supabase.from('group_items').insert(groupItems);

      showToast("Đã tạo gói thuốc thành công!");
      setSelectedIds([]);
      setSelectionMode(false);
      setGroupForm({ name: '', purpose: '' });
      setIsCreatingGroup(false);
      fetchData();
      setActiveTab('groups');
    } catch (error) {
      console.error(error);
      showToast("Lỗi tạo gói", "error");
    } finally {
      setIsAnalyzingGroup(false);
    }
  };

  const toggleAdherence = async (itemId: number, type: 'medicine' | 'group', timeSlot: string) => {
    if (!supabase || !user) return;
    const today = new Date().toISOString().split('T')[0];
    const current = adherence.find(a => a.item_id === itemId && a.type === type && a.time_slot === timeSlot && a.date === today);
    const newStatus = current?.status === 1 ? 0 : 1;
    
    try {
      if (current) {
        await supabase.from('adherence_records').update({ status: newStatus }).eq('id', current.id);
      } else {
        await supabase.from('adherence_records').insert([{ 
          item_id: itemId, type, time_slot: timeSlot, date: today, status: newStatus, user_id: user.id 
        }]);
      }
      fetchData();
    } catch (e) {
      showToast("Lỗi cập nhật", "error");
    }
  };

  const deleteItem = async (id: number) => {
    if (!supabase) return;
    try {
      await supabase.from('medicines').delete().eq('id', id);
      setInventory(inventory.filter(i => i.id !== id));
      showToast("Đã xóa thuốc");
    } catch (e) {
      showToast("Lỗi khi xóa", "error");
    }
  };

  const toggleTaken = async (id: number, status: boolean) => {
    if (!supabase) return;
    const newStatus = !status;
    try {
      await supabase.from('medicines').update({ is_taken: newStatus }).eq('id', id);
      setInventory(inventory.map(i => i.id === id ? { ...i, is_taken: newStatus } : i));
    } catch (e) {
      showToast("Lỗi cập nhật", "error");
    }
  };

  const saveManualEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase || !user) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      usage: formData.get('usage') as string,
      expiry_date: formData.get('expiry_date') as string,
      category: formData.get('category') as string,
      recommended_shelf_life: 'N/A',
      simple_instructions: formData.get('usage') as string,
      interaction_warning: 'N/A',
      disposal_tip: 'N/A',
      is_taken: false,
      user_id: user.id
    };

    try {
      await supabase.from('medicines').insert([data]);
      showToast("Đã thêm thuốc thành công");
      setShowManualEntry(false);
      fetchData();
    } catch (error) {
      showToast("Lỗi khi thêm thuốc", "error");
    }
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [inventory, searchQuery]);

  // --- Screens ---

  if (!supabase || !ai) {
    return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-red-100">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Thiếu Cấu Hình API</h1>
        <p className="text-slate-500 max-w-xs mb-8">
          Vui lòng kiểm tra lại <strong>VITE_SUPABASE_URL</strong>, <strong>VITE_SUPABASE_ANON_KEY</strong> và <strong>VITE_GEMINI_API_KEY</strong> trong biến môi trường.
        </p>
      </div>
    );
  }

  if (authLoading) {
    return <div className="h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-emerald-600" /></div>;
  }

  if (!user) {
    return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-emerald-100">
          <HeartPulse className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">MedGuard AI</h1>
        <p className="text-slate-500 max-w-xs mb-8 text-sm">
          Hệ thống quản lý tủ thuốc thông minh dành cho gia đình. Vui lòng đăng nhập để tiếp tục.
        </p>
        <div className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 w-full max-w-sm space-y-4 text-left">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 mt-1"
              placeholder="Nhập email của bạn"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Mật khẩu</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 mt-1"
              placeholder="Ít nhất 6 ký tự"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button 
              onClick={(e) => handleAuth(e, true)}
              disabled={isLoginLoading}
              className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm"
            >
              Đăng ký
            </button>
            <button 
              onClick={(e) => handleAuth(e, false)}
              disabled={isLoginLoading}
              className="flex-[1.5] bg-emerald-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center text-sm"
            >
              {isLoginLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Đăng nhập"}
            </button>
          </div>
        </div>
        <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }} className={`fixed bottom-20 left-1/2 z-[110] px-5 py-3 rounded-xl shadow-2xl font-bold text-white text-xs flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-red-600'}`}>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    );
  }

  // --- Render Helpers ---
  const renderSchedule = () => {
    const slots = ['Sáng', 'Trưa', 'Chiều', 'Tối'];
    const today = new Date().toISOString().split('T')[0];

    const shouldShowInSlot = (item: Medicine, slot: string) => {
      const usage = item.usage.toLowerCase();
      const name = item.name.toLowerCase();
      
      if (usage.includes("không phải thuốc") || name.includes("không phải thuốc")) return false;
      if (usage.includes("thực phẩm bổ sung") && !usage.includes("uống")) return false;

      if (usage.includes(slot.toLowerCase())) return true;
      
      if (usage.includes("2 lần") || usage.includes("2 chai") || usage.includes("2 viên")) {
        return slot === 'Sáng' || slot === 'Tối';
      }
      if (usage.includes("3 lần") || usage.includes("3 chai") || usage.includes("3 viên")) {
        return slot === 'Sáng' || slot === 'Trưa' || slot === 'Tối';
      }
      if (usage.includes("1 lần") || usage.includes("1 chai") || usage.includes("1 viên")) {
        return slot === 'Sáng';
      }
      
      if (usage.includes("khi cần") || usage.includes("nếu đau")) return false;
      
      return true;
    };

    const shouldGroupShowInSlot = (group: MedicineGroup, slot: string) => {
      const schedule = group.ai_schedule.toLowerCase();
      return schedule.includes(slot.toLowerCase());
    };

    return (
      <div className="h-full flex flex-col p-4 gap-6 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Lịch trình hôm nay</h2>
          <Calendar className="w-6 h-6 text-emerald-600" />
        </div>

        {slots.map(slot => {
          const slotItems = inventory.filter(i => !i.is_taken && shouldShowInSlot(i, slot));
          const slotGroups = groups.filter(g => shouldGroupShowInSlot(g, slot));

          if (slotItems.length === 0 && slotGroups.length === 0) return null;

          return (
            <div key={slot} className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <Clock className="w-4 h-4" />
                <h3 className="font-bold uppercase text-xs tracking-widest">{slot}</h3>
              </div>
              <div className="space-y-2">
                {slotItems.map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm">{item.name}</h4>
                      <p className="text-[10px] text-slate-400">{item.usage}</p>
                    </div>
                    <button 
                      onClick={() => toggleAdherence(item.id, 'medicine', slot)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        adherence.find(a => a.item_id === item.id && a.type === 'medicine' && a.time_slot === slot && a.date === today)?.status === 1
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-50 text-slate-300'
                      }`}
                    >
                      <Check className="w-6 h-6" />
                    </button>
                  </div>
                ))}
                {slotGroups.map(group => (
                  <div key={group.id} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <h4 className="font-bold text-sm text-emerald-900">{group.name}</h4>
                      <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                        {group.items.map(i => i.name).join(', ')}
                      </p>
                    </div>
                    <button 
                      onClick={() => toggleAdherence(group.id, 'group', slot)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        adherence.find(a => a.item_id === group.id && a.type === 'group' && a.time_slot === slot && a.date === today)?.status === 1
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-emerald-300'
                      }`}
                    >
                      <Check className="w-6 h-6" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`h-[100dvh] bg-slate-50 font-sans text-slate-900 overflow-hidden flex ${isDesktop ? 'flex-row' : 'flex-col max-w-[540px] mx-auto shadow-2xl relative border-x border-slate-200'}`}>
      
      {/* Desktop Sidebar */}
      {isDesktop && (
        <aside className="w-72 bg-white border-r border-slate-100 flex flex-col shrink-0">
          <div className="p-8 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <HeartPulse className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">MedGuard AI</h1>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {[
              { id: 'scan', icon: Camera, label: 'Quét thuốc' },
              { id: 'inventory', icon: Package, label: 'Tủ thuốc' },
              { id: 'groups', icon: Layers, label: 'Gói thuốc' },
              { id: 'schedule', icon: ListChecks, label: 'Lịch trình' },
              { id: 'chat', icon: MessageSquare, label: 'Bác sĩ', hideOnWide: true }
            ].filter(tab => !tab.hideOnWide || !isWide).map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl font-bold transition-all ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="p-6 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-2 px-2 pb-2 text-xs font-bold text-slate-400">
              <User className="w-4 h-4" /> {user.email?.split('@')[0]}
            </div>
            <button 
              onClick={() => setShowSettings(true)} 
              className="w-full bg-slate-50 text-slate-600 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-[0.98]"
            >
              <Settings className="w-5 h-5" /> Cài đặt liên hệ
            </button>
            <button 
              onClick={() => setShowSOS(true)} 
              className="w-full bg-red-50 text-red-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-all active:scale-[0.98] shadow-sm"
            >
              <PhoneCall className="w-5 h-5" /> SOS Khẩn cấp
            </button>
            <button 
              onClick={() => supabase?.auth.signOut()} 
              className="w-full bg-slate-50 text-slate-500 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
            >
              <LogOut className="w-4 h-4" /> Đăng xuất
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Header */}
      {!isDesktop && (
        <header className="bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between shadow-sm border-b border-slate-100 shrink-0 z-50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-emerald-600 rounded-[14px] flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none mb-0.5">MedGuard AI</h1>
              <p className="text-[10px] text-slate-400 font-medium">{user.email?.split('@')[0]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="w-10 h-10 bg-slate-50 text-slate-600 rounded-[14px] flex items-center justify-center border border-slate-100 active:scale-95 transition-all"><Settings className="w-5 h-5" /></button>
            <button onClick={() => supabase?.auth.signOut()} className="w-10 h-10 bg-slate-50 text-slate-500 rounded-[14px] flex items-center justify-center border border-slate-100 active:scale-95 transition-all"><LogOut className="w-4 h-4" /></button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <div className={`flex-1 flex overflow-hidden ${!isDesktop ? 'pb-[72px]' : ''}`}>
        <main className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'scan' ? (
              <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
                <div className="flex gap-3 shrink-0">
                  {[
                    { id: 'medicine', icon: Pill, label: 'Quét thuốc' },
                    { id: 'symptom', icon: Stethoscope, label: 'Triệu chứng' },
                    { id: 'translate', icon: BookOpen, label: 'Dịch thuật' }
                  ].map(mode => (
                    <button 
                      key={mode.id}
                      onClick={() => setScanMode(mode.id as any)} 
                      className={`flex-1 py-3.5 rounded-2xl font-bold text-[11px] flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
                        scanMode === mode.id 
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                          : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <mode.icon className="w-4 h-4" /> {mode.label}
                    </button>
                  ))}
                </div>

                <div className="relative aspect-[3/4] lg:aspect-auto lg:h-[450px] bg-black rounded-[32px] overflow-hidden shadow-xl border-4 border-white shrink-0">
                  {!capturedImage ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      {!isCameraActive && !isStartingCamera.current && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 p-6 text-center">
                          <AlertCircle className="w-12 h-12 text-amber-400 mb-4" />
                          <p className="text-white font-bold mb-4">Không thể khởi động camera</p>
                          <button 
                            onClick={() => startCamera()} 
                            className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2"
                          >
                            <RefreshCw className="w-4 h-4" /> Thử lại
                          </button>
                        </div>
                      )}
                      <div className="absolute top-4 right-4 flex flex-col gap-2">
                        <button onClick={() => setIsFlashOn(!isFlashOn)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${isFlashOn ? 'bg-amber-400 text-white' : 'bg-black/30 text-white'}`}><Zap className="w-5 h-5" /></button>
                        <button onClick={() => setFacingMode(facingMode === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><RefreshCw className="w-5 h-5" /></button>
                        <button onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.5))} className="w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><ZoomIn className="w-5 h-5" /></button>
                        <button onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.5))} className="w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><ZoomOut className="w-5 h-5" /></button>
                      </div>
                      <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-8">
                        <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><Upload className="w-5 h-5" /></button>
                        <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-8 border-white/20 flex items-center justify-center active:scale-90 transition-transform"><div className="w-14 h-14 bg-emerald-600 rounded-full shadow-lg" /></button>
                        <div className="w-12 h-12" />
                      </div>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    </>
                  ) : (
                    <div className="relative h-full">
                      <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                      <button onClick={() => { setCapturedImage(null); setAnalysisResult(null); }} className="absolute top-6 right-6 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md"><X className="w-5 h-5" /></button>
                    </div>
                  )}
                </div>

                {capturedImage && !analysisResult && !isAnalyzing && (
                  <button onClick={() => analyzeMedicine()} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 shrink-0"><Search className="w-5 h-5" /> Phân tích ngay</button>
                )}

                {isAnalyzing && (
                  <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-100 shrink-0"><Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-3" /><p className="font-bold">Đang tra cứu AI...</p></div>
                )}

                {translatedText && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/70 backdrop-blur-xl p-6 rounded-[32px] shadow-2xl border border-white/40 space-y-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">BẢN DỊCH TẠM THỜI</h3>
                        <h4 className="font-bold text-lg text-slate-900 leading-tight">Thông tin thuốc</h4>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                      <Markdown>{translatedText}</Markdown>
                    </div>
                    <button onClick={() => { setTranslatedText(null); setCapturedImage(null); }} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm">Đóng bản dịch</button>
                  </motion.div>
                )}

                {analysisResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="bg-white/70 backdrop-blur-xl p-6 rounded-[32px] shadow-2xl border border-white/40 space-y-5"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">KẾT QUẢ PHÂN TÍCH</h3>
                          <h4 className="font-bold text-lg text-slate-900 leading-tight">Xem & Chỉnh sửa</h4>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên thuốc</label>
                        <input 
                          value={analysisResult.name} 
                          onChange={(e) => setAnalysisResult({...analysisResult, name: e.target.value})}
                          className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Hướng dẫn sử dụng</label>
                          <button 
                            onClick={() => analyzeMedicine(undefined, analysisResult.usage)}
                            className="text-[9px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" /> Cập nhật chú thích
                          </button>
                        </div>
                        <textarea 
                          value={analysisResult.usage} 
                          onChange={(e) => setAnalysisResult({...analysisResult, usage: e.target.value})}
                          className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Hạn sử dụng</label>
                          <input 
                            value={analysisResult.expiry_date} 
                            onChange={(e) => setAnalysisResult({...analysisResult, expiry_date: e.target.value})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nhóm</label>
                          <input 
                            value={analysisResult.category} 
                            onChange={(e) => setAnalysisResult({...analysisResult, category: e.target.value})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <p className="text-[10px] font-bold text-amber-600 uppercase">Cảnh báo nguy cơ</p>
                        </div>
                        <p className="text-xs text-amber-800 leading-relaxed font-medium">{analysisResult.interaction_warning}</p>
                      </div>
                    </div>

                <div className="pt-2">
                  <button 
                    onClick={async () => { 
                      if (supabase && user) {
                        await supabase.from('medicines').insert([{...analysisResult, user_id: user.id}]);
                      }
                      setAnalysisResult(null); 
                      setCapturedImage(null); 
                      fetchData(); 
                      showToast("Đã lưu vào tủ thuốc thành công!"); 
                    }} 
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold shadow-xl shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" /> Lưu vào tủ thuốc
                  </button>
                </div>
                  </motion.div>
                )}
              </motion.div>
            ) : activeTab === 'inventory' ? (
              <motion.div key="inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col p-4 gap-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Tìm thuốc..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border-none rounded-xl py-3 pl-10 pr-10 text-sm shadow-sm focus:ring-2 focus:ring-emerald-500" />
                    <button onClick={toggleListening} className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 ${isListening ? 'text-red-600 animate-pulse' : 'text-slate-400'}`}><Mic className="w-4 h-4" /></button>
                  </div>
                  <button onClick={() => setSelectionMode(!selectionMode)} className={`p-3 rounded-xl shadow-md transition-colors ${selectionMode ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>
                    <ListChecks className="w-5 h-5" />
                  </button>
                  <button onClick={() => setShowManualEntry(true)} className="bg-emerald-600 text-white p-3 rounded-xl shadow-lg"><Plus className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
                    {filteredInventory.map(item => (
                      <MedicineCard 
                        key={item.id} 
                        item={item} 
                        onToggleTaken={toggleTaken} 
                        onDelete={deleteItem} 
                        onAskAI={(med) => { setSelectedMedicineForChat(med); setActiveTab('chat'); }}
                        selectable={selectionMode}
                        selected={selectedIds.includes(item.id)}
                        onSelect={(id) => {
                          setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
                        }}
                      />
                    ))}
                  </div>
                </div>
                {selectionMode && selectedIds.length > 0 && (
                  <motion.div initial={{ y: 50 }} animate={{ y: 0 }} className="absolute bottom-6 inset-x-4">
                    <button onClick={() => setIsCreatingGroup(true)} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-2xl flex items-center justify-center gap-2">
                      <Layers className="w-5 h-5" /> Tạo gói thuốc ({selectedIds.length})
                    </button>
                  </motion.div>
                )}
              </motion.div>
            ) : activeTab === 'groups' ? (
              <motion.div key="groups" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
                <h2 className="text-2xl font-bold">Gói thuốc của bạn</h2>
                <div className="grid grid-cols-1 gap-4">
                  {groups.map(group => (
                    <div key={group.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                      <div 
                        className="flex items-center gap-4 cursor-pointer"
                        onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                      >
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                          <Folder className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 truncate">{group.name}</h3>
                          <p className="text-[11px] text-slate-500 truncate">{group.purpose}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={async (e) => { 
                            e.stopPropagation(); 
                            if(supabase) await supabase.from('medicine_groups').delete().eq('id', group.id);
                            fetchData(); 
                          }} className="text-slate-300 hover:text-red-600 p-2">
                            <Trash2 className="w-5 h-5" />
                          </button>
                          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedGroupId === group.id ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {expandedGroupId === group.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-2">
                              <div className="text-[11px] leading-relaxed prose prose-sm max-w-none">
                                <Markdown>{group.ai_schedule}</Markdown>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : activeTab === 'schedule' ? (
              <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
                {renderSchedule()}
              </motion.div>
            ) : (
              <div className="h-full flex flex-col bg-white">
                {/* Chat content handled below for side-by-side */}
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* Chat Side-by-Side for Wide Screens or Chat Tab for Mobile/Tablet */}
        {(isWide || activeTab === 'chat') && (
          <aside className={`${isWide ? 'w-[400px] border-l border-slate-100' : 'w-full'} h-full flex flex-col bg-white shrink-0`}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center"><User className="w-5 h-5" /></div>
                <h3 className="font-bold text-sm">Bác sĩ MedGuard</h3>
              </div>
              <button onClick={async () => { if(supabase && user) await supabase.from('chat_history').delete().eq('user_id', user.id); setChatHistory([]); }} className="text-slate-300"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-[24px] text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-emerald-600 text-white rounded-tr-none shadow-emerald-100' 
                      : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                  }`}>
                    <div className="prose prose-sm max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {isSendingChat && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 p-4 rounded-[24px] rounded-tl-none flex gap-1.5">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-slate-100 bg-white shrink-0">
              {selectedMedicineForChat && <div className="mb-2 p-2 bg-emerald-50 rounded-xl flex items-center justify-between text-[10px] font-bold text-emerald-700 border border-emerald-100"><span>Hỏi về: {selectedMedicineForChat.name}</span><button onClick={() => setSelectedMedicineForChat(null)}><X className="w-3 h-3" /></button></div>}
              <form onSubmit={handleChat} className="flex gap-2">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={chatInput} 
                    onChange={(e) => setChatInput(e.target.value)} 
                    placeholder={isListening ? "Đang lắng nghe..." : "Hỏi bác sĩ..."} 
                    className={`w-full bg-slate-100 border-none rounded-xl pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all ${isListening ? 'ring-2 ring-emerald-400 bg-emerald-50' : ''}`} 
                  />
                  <button type="button" onClick={toggleListening} className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 transition-all ${isListening ? 'text-emerald-600 scale-125' : 'text-slate-400'}`}>
                    {isListening ? <div className="relative"><Mic className="w-4 h-4" /><div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-50" /></div> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
                <button type="submit" disabled={isSendingChat || (!chatInput.trim() && !selectedMedicineForChat)} className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md disabled:opacity-50"><Send className="w-5 h-5" /></button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      {!isDesktop && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 flex items-center justify-between z-50 pb-safe max-w-[540px] mx-auto">
          {[
            { id: 'scan', icon: Camera, label: 'Quét' },
            { id: 'inventory', icon: Package, label: 'Tủ thuốc' },
            { id: 'groups', icon: Layers, label: 'Gói thuốc' },
            { id: 'schedule', icon: ListChecks, label: 'Lịch' },
            { id: 'chat', icon: MessageSquare, label: 'Chat', hideOnWide: true }
          ].filter(tab => !tab.hideOnWide || !isWide).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center gap-1 transition-all ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400'}`}>
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'scale-110' : ''}`} />
              <span className="text-[9px] font-bold uppercase tracking-tighter">{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[360px] rounded-[32px] p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Cài đặt cuộc gọi</h2>
                <button onClick={() => setShowSettings(false)}><X className="w-5 h-5 text-slate-300" /></button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!supabase || !user) return;
                const formData = new FormData(e.currentTarget);
                const data = {
                  emergency_name: formData.get('emergency_name') as string,
                  emergency_phone: formData.get('emergency_phone') as string,
                  user_id: user.id
                };
                await supabase.from('app_settings').upsert([data]);
                fetchData();
                setShowSettings(false);
                showToast("Đã cập nhật cài đặt thành công");
              }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên người thân</label>
                  <input 
                    name="emergency_name" 
                    defaultValue={settings?.emergency_name || ''}
                    required 
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" 
                    placeholder="Ví dụ: Con trai"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số điện thoại</label>
                  <input 
                    name="emergency_phone" 
                    defaultValue={settings?.emergency_phone || ''}
                    required 
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" 
                    placeholder="Ví dụ: 0901234567"
                  />
                </div>
                <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg mt-2">Lưu cài đặt</button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showSOS && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[320px] rounded-[32px] p-8 text-center shadow-2xl">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><PhoneCall className="w-8 h-8" /></div>
              <h2 className="text-xl font-bold mb-1">Khẩn cấp</h2>
              <p className="text-xs text-slate-500 mb-6">Liên hệ ngay nếu bạn cần giúp đỡ.</p>
              <div className="space-y-3">
                <a href="tel:115" className="flex items-center justify-center w-full bg-red-600 text-white py-4 rounded-2xl font-bold shadow-lg">Gọi Cấp cứu (115)</a>
                {settings?.emergency_phone && <a href={`tel:${settings.emergency_phone}`} className="flex items-center justify-center w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg">Gọi {settings.emergency_name}</a>}
                <button onClick={() => setShowSOS(false)} className="w-full py-2 text-slate-400 text-sm font-bold">Đóng</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showManualEntry && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[360px] rounded-[32px] p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Thêm thuốc thủ công</h2><button onClick={() => setShowManualEntry(false)}><X className="w-5 h-5 text-slate-300" /></button></div>
              <form onSubmit={saveManualEntry} className="space-y-4">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên thuốc</label><input name="name" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Công dụng</label><input name="usage" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Hạn dùng</label><input name="expiry_date" type="date" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nhóm</label><input name="category" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" /></div>
                </div>
                <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg mt-2">Lưu thuốc</button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isCreatingGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[360px] rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
              {isAnalyzingGroup && <div className="absolute inset-0 bg-white/90 backdrop-blur flex flex-col items-center justify-center z-10 p-8 text-center"><Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-3" /><p className="font-bold">Đang lập lịch trình...</p></div>}
              <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Tạo gói thuốc</h2><button onClick={() => setIsCreatingGroup(false)}><X className="w-5 h-5 text-slate-300" /></button></div>
              <div className="space-y-4">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên gói</label><input value={groupForm.name} onChange={(e) => setGroupForm({...groupForm, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Ví dụ: Đơn cảm cúm" /></div>
                <button onClick={createGroupFromSelection} disabled={!groupForm.name || selectedIds.length === 0} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50">Lưu & Lập lịch</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }} className={`fixed bottom-20 left-1/2 z-[110] px-5 py-3 rounded-xl shadow-2xl font-bold text-white text-xs flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-red-600'}`}>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        @media (max-width: 1199px) {
          body { overflow: hidden; position: fixed; width: 100%; height: 100%; }
        }
      `}</style>
    </div>
  );
}
