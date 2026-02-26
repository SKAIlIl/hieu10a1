import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

// Sửa lỗi __dirname cho chuẩn ES Module để Vercel không báo lỗi
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Tự động nạp các biến VITE_ từ Vercel hoặc file .env
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Giúp bạn gọi code ngắn gọn bằng dấu @ (VD: @/components/...)
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      // Đảm bảo AI có thể đọc được key kể cả khi chạy môi trường dev
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
    },
    server: {
      // Mở cổng 5173 để bạn test trên máy tính lớp A1
      port: 5173,
      strictPort: true,
      host: true,
    },
    build: {
      // Tối ưu hóa dung lượng file khi nộp bài để web load nhanh hơn
      outDir: 'dist',
      sourcemap: false,
    }
  };
});