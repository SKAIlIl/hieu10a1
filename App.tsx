import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Package, Search, Trash2, AlertTriangle, CheckCircle2, 
  Loader2, RefreshCw, Bell, Pill, ChevronRight, Settings, 
  User, Plus, Layers, BookOpen, HeartPulse, ChevronDown,
  MessageSquare, Send, Mic, Image as ImageIcon,
  Stethoscope, AlertCircle, Zap, Upload, Check, ListChecks, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { createClient } from '@supabase/supabase-js';

// --- 1. KHỞI TẠO KẾT NỐI (SUPABASE & GEMINI) ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenAI(import.meta.env.VITE_GEMINI_API_KEY || "");

// --- 2. ĐỊNH NGHĨA DỮ LIỆU ---
interface Medicine {
  id: string;
  name: string;
  usage: string;
  simple_instructions: string;
  interaction_warning: string;
  category: string;
  expiry_date: string;
  image_url?: string;
  is_manual?: boolean;
  scanned_at: string;
}

interface MedicineGroup {
  id: string;
  group_name: string;
  purpose: string;
  ai_schedule: any;
  items: Medicine[];
  created_at: string;
}

export default function App() {
  // --- STATE QUẢN LÝ ---
  const [activeTab, setActiveTab] = useState<'scan' | 'inventory' | 'groups' | 'chat' | 'translate'>('inventory');
  const [inventory, setInventory] = useState<Medicine[]>([]);
  const [groups, setGroups] = useState<MedicineGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'warning'} | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [userInput, setUserInput] = useState("");
  
  // State cho Scan & Translate
  const [scannedResult, setScannedResult] = useState<any>(null);
  const [translationResult, setTranslationResult] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- 3. LOGIC DATABASE (THAY THẾ SERVER.TS) ---
  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Lấy tủ thuốc
      const { data: inv, error: e1 } = await supabase.from("inventory").select("*").order("scanned_at", { ascending: false });
      if (e1) throw e1;
      setInventory(inv || []);

      // Lấy nhóm thuốc + Items (Accordion logic)
      const { data: grps, error: e2 } = await supabase.from("medicine_groups").select("*, group_items(inventory(*))");
      if (e2) throw e2;
      const formatted = grps.map(g => ({
        ...g,
        items: g.group_items?.map((gi: any) => gi.inventory).filter(Boolean) || []
      }));
      setGroups(formatted);

      // Lấy chat
      const { data: chats } = await supabase.from("chat_history").select("*").order("timestamp", { ascending: true });
      setChatHistory(chats || []);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- 4. LOGIC AI (SCAN VS TRANSLATE) ---
  const analyzeImage = async (base64Data: string, isTranslateOnly: boolean = false) => {
    setLoading(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = isTranslateOnly 
        ? "Dịch toàn bộ thông tin trên bao bì thuốc này sang tiếng Việt dễ hiểu. Tập trung vào thành phần và liều dùng. Không thêm lời chào."
        : "Phân tích ảnh thuốc. Trả về JSON: {name, usage, simple_instructions, interaction_warning, category, expiry_date}. Ngôn ngữ: Tiếng Việt. Không nói nhảm.";

      const result = await model.generateContent([prompt, { inlineData: { data: base64Data.split(',')[1], mimeType: "image/jpeg" } }]);
      const response = await result.response.text();

      if (isTranslateOnly) {
        setTranslationResult(response);
        setActiveTab('translate');
      } else {
        const cleanJson = response.replace(/```json|```/g, "").trim();
        setScannedResult(JSON.parse(cleanJson));
        setIsEditing(true);
      }
    } catch (err) {
      showToast("AI không đọc được ảnh này, hãy thử lại", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMedicine = async () => {
    const { error } = await supabase.from("inventory").insert([{ ...scannedResult, scanned_at: new Date().toISOString() }]);
    if (error) showToast(error.message, "error");
    else {
      showToast("Đã lưu vào tủ thuốc");
      setScannedResult(null);
      setIsEditing(false);
      fetchData();
      setActiveTab('inventory');
    }
  };

  // --- 5. GIAO DIỆN CHÍNH ---
  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-24 font-sans relative overflow-x-hidden">
      {/* Header */}
      <header className="bg-white p-6 pt-12 shadow-sm rounded-b-[32px] mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">MedGuard AI</h1>
            <p className="text-slate-500 text-xs font-medium">Lớp A1 - Bùi Thị Xuân</p>
          </div>
          <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600">
            <Stethoscope size={24} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6">
        <AnimatePresence mode="wait">
          {/* TỦ THUỐC */}
          {activeTab === 'inventory' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="inv">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-800">Tủ thuốc của bạn</h2>
                <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">{inventory.length} Loại</span>
              </div>
              {inventory.map((med) => (
                <div key={med.id} className="medical-card p-4 mb-3 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <Pill size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-sm">{med.name}</h3>
                    <p className="text-slate-500 text-[10px] line-clamp-1">{med.usage}</p>
                  </div>
                  <button onClick={async () => { await supabase.from("inventory").delete().eq("id", med.id); fetchData(); }} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}

          {/* NHÓM THUỐC (ACCORDION UI) */}
          {activeTab === 'groups' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key="groups">
              <h2 className="text-lg font-bold mb-4 text-slate-800">Gói thuốc thông minh</h2>
              {groups.map(group => (
                <div key={group.id} className="medical-card mb-3 border-l-4 border-l-emerald-500">
                  <button 
                    onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                    className="w-full p-4 flex justify-between items-center"
                  >
                    <div className="text-left">
                      <h3 className="font-bold text-slate-800">{group.group_name}</h3>
                      <p className="text-slate-500 text-[10px]">{group.purpose}</p>
                    </div>
                    <ChevronDown size={20} className={`text-slate-400 transition-transform ${expandedGroup === group.id ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedGroup === group.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-50 bg-slate-50/50">
                      {group.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 py-2 text-xs text-slate-600">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* DỊCH THUỐC (NEW TAB) */}
          {activeTab === 'translate' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="trans">
              <h2 className="text-lg font-bold mb-4">Dịch thuật y tế</h2>
              <div className="medical-card p-6 bg-white min-h-[300px]">
                {translationResult ? (
                  <div className="prose prose-sm max-w-none text-slate-700">
                    <Markdown>{translationResult}</Markdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 mt-20">
                    <BookOpen size={48} />
                    <p className="text-sm font-medium">Chưa có bản dịch nào. Hãy quét thuốc ngoại!</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Action Menu (Scan) */}
      <div className="fixed bottom-28 right-6 flex flex-col gap-3">
        <label className="bg-blue-600 text-white p-4 rounded-full shadow-2xl cursor-pointer hover:scale-110 transition-transform flex items-center justify-center">
          <BookOpen size={24} />
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => analyzeImage(ev.target?.result as string, true);
              reader.readAsDataURL(file);
            }
          }} />
        </label>
        <label className="bg-emerald-600 text-white p-5 rounded-full shadow-2xl cursor-pointer hover:scale-110 transition-transform flex items-center justify-center">
          <Camera size={28} />
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => analyzeImage(ev.target?.result as string, false);
              reader.readAsDataURL(file);
            }
          }} />
        </label>
      </div>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 py-4 flex justify-between items-center z-[100]">
        {[
          { id: 'inventory', icon: Package, label: 'Tủ thuốc' },
          { id: 'groups', icon: Layers, label: 'Gói thuốc' },
          { id: 'translate', icon: BookOpen, label: 'Dịch' },
          { id: 'chat', icon: MessageSquare, label: 'Bác sĩ AI' }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === item.id ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}
          >
            <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[200] flex items-center justify-center">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-emerald-600" size={40} />
            <p className="text-slate-800 font-bold text-sm">Bác sĩ MedGuard đang xử lý...</p>
          </div>
        </div>
      )}

      {/* Scan Result Modal */}
      {isEditing && scannedResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] p-6 flex items-center justify-center">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl">
            <div className="bg-emerald-600 p-6 text-white">
              <h3 className="text-xl font-bold">Xác nhận thông tin</h3>
              <p className="text-emerald-100 text-xs mt-1">Vui lòng kiểm tra lại trước khi lưu</p>
            </div>
            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tên thuốc</label>
                <input value={scannedResult.name} onChange={e => setScannedResult({...scannedResult, name: e.target.value})} className="w-full border-b border-slate-200 py-2 font-bold text-slate-800 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Hướng dẫn</label>
                <textarea value={scannedResult.simple_instructions} onChange={e => setScannedResult({...scannedResult, simple_instructions: e.target.value})} className="w-full border-b border-slate-200 py-2 text-sm text-slate-600 focus:outline-none min-h-[80px]" />
              </div>
              <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                <p className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1"><AlertTriangle size={12}/> Cảnh báo nguy cơ</p>
                <p className="text-xs text-red-700 mt-1 font-medium">{scannedResult.interaction_warning}</p>
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setIsEditing(false)} className="flex-1 py-4 text-slate-500 font-bold text-sm">Hủy</button>
              <button onClick={handleSaveMedicine} className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200">Lưu vào tủ thuốc</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className={`fixed bottom-24 left-6 right-6 p-4 rounded-2xl shadow-xl z-[400] text-white font-bold text-sm flex items-center gap-3 ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
            <Check size={20} />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}