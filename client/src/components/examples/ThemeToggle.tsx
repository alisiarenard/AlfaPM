import { ThemeToggle } from '../ThemeToggle';
import { ThemeProvider } from '@/lib/theme-provider';

export default function ThemeToggleExample() {
  return (
    <ThemeProvider>
      <div className="flex items-center justify-center p-8 bg-background">
        <ThemeToggle />
      </div>
    </ThemeProvider>
  );
}
