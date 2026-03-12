import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Đường dẫn tương đối
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Đánh dấu các thư viện này là external để trình duyệt dùng bản từ CDN (importmap)
      // thay vì Vite cố gắng bundle chúng (gây lỗi nếu không npm install)
      external: ['react', 'react-dom', 'react-dom/client', 'recharts', 'lucide-react', 'xlsx'],
    }
  },
})