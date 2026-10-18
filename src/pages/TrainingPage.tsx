import AppLayout from '@/components/layouts/AppLayout';
import { GraduationCap } from 'lucide-react';

/** «Обучение» — раздел готовится. */
export default function TrainingPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <GraduationCap size={30} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Обучение</h1>
        <span className="mt-3 inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-sm font-medium">В разработке</span>
      </div>
    </AppLayout>
  );
}
