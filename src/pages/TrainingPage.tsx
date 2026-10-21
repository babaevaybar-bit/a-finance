import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getAllProfiles } from '@/lib/api';
import { toast } from 'sonner';
import {
  GraduationCap, BookOpen, CheckCircle2, Circle, ChevronLeft, ChevronRight, Clock, Sparkles,
  MessageCircleQuestion, Users, RotateCcw, ThumbsUp, Repeat, List, Layers,
} from 'lucide-react';
import { COURSES, QA_CARDS, QA_TRAINER_ID, ALL_ITEMS, PLANNED_MODULES, type Course, type Lesson } from '@/lib/trainingContent';
import RichText from '@/components/training/RichText';
import Quiz from '@/components/training/Quiz';
import HandbookPages, { HandbookUpload } from '@/components/training/HandbookPages';
import type { Profile } from '@/types/types';
import { UserAvatar } from '@/components/common/UserAvatar';

interface ProgressRow {
  user_id: string; lesson_id: string; score: number; total: number; best_score: number;
  passed: boolean; attempts: number; completed_at: string | null; updated_at: string;
}

function useProgress() {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from('training_progress').select('*');
    setRows((data ?? []) as ProgressRow[]);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function submit(lessonId: string, score: number, total: number) {
    const { error } = await supabase.rpc('submit_training_result', { p_lesson: lessonId, p_score: score, p_total: total });
    if (error) { toast.error('Не удалось сохранить результат'); return; }
    await load();
  }
  return { rows, loaded, submit };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Qyzylorda' });

// ─── Список курсов ───────────────────────────────────────────────────────────
function CourseCard({ course, done, onOpen }: { course: Course; done: Set<string>; onOpen: () => void }) {
  const n = course.lessons.filter(l => done.has(l.id)).length;
  const pct = Math.round((n / course.lessons.length) * 100);
  const mins = course.lessons.reduce((s, l) => s + l.minutes, 0);
  return (
    <button type="button" onClick={onOpen} className="text-left rounded-2xl border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition flex flex-col">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${course.color}`}><BookOpen size={20} /></div>
      <h3 className="mt-4 font-semibold">{course.title}</h3>
      <p className="text-sm text-muted-foreground mt-1 flex-1">{course.subtitle}</p>
      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{course.lessons.length} уроков</span><span>·</span><span>~{mins} мин</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Progress value={pct} className="h-1.5 flex-1" />
        <span className="text-xs font-medium tabular-nums w-14 text-right">{n}/{course.lessons.length}</span>
      </div>
    </button>
  );
}

function Home({ done, onCourse, onTrainer, onTeam, canTeam, trainerDone }: {
  done: Set<string>; onCourse: (id: string) => void; onTrainer: () => void; onTeam: () => void; canTeam: boolean; trainerDone: boolean;
}) {
  const total = ALL_ITEMS.length;
  const n = ALL_ITEMS.filter(i => done.has(i.id)).length;
  const next = COURSES.flatMap(c => c.lessons.map(l => ({ c, l }))).find(x => !done.has(x.l.id));
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><GraduationCap size={22} className="text-primary" />Обучение</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Пошаговый курс для менеджера: от знакомства с фабрикой до продаж и оформления заказа. После каждого урока — короткий тест.</p>
        </div>
        {canTeam && <Button variant="outline" size="sm" onClick={onTeam}><Users size={14} className="mr-1.5" />Прогресс команды</Button>}
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 flex flex-wrap items-center gap-5">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm text-muted-foreground">Мой прогресс</p>
          <p className="text-2xl font-semibold mt-0.5">{n} из {total} <span className="text-base font-normal text-muted-foreground">пройдено</span></p>
          <Progress value={(n / total) * 100} className="h-2 mt-3" />
        </div>
        {next && (
          <Button onClick={() => onCourse(`${next.c.id}/${next.l.id}`)}>
            {n === 0 ? 'Начать' : 'Продолжить'}: {next.l.title}<ChevronRight size={16} className="ml-1" />
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COURSES.map(c => <CourseCard key={c.id} course={c} done={done} onOpen={() => onCourse(c.id)} />)}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Скоро</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED_MODULES.map((t, i) => (
            <div key={t} className="rounded-xl border border-dashed px-4 py-3 flex items-center gap-3 text-sm text-muted-foreground">
              <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold tabular-nums shrink-0">{COURSES.length + i + 1}</span>
              <span className="flex-1">{t}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold shrink-0">в разработке</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Курс: список уроков ─────────────────────────────────────────────────────
function CourseView({ course, done, rows, onLesson, onBack }: {
  course: Course; done: Set<string>; rows: ProgressRow[]; onLesson: (id: string) => void; onBack: () => void;
}) {
  const { isDirector } = useAuth();
  const n = course.lessons.filter(l => done.has(l.id)).length;
  return (
    <div className="space-y-5 max-w-3xl">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"><ChevronLeft size={16} />Все курсы</button>
      <div>
        <h1 className="text-xl font-semibold">{course.title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{course.subtitle}</p>
        <div className="mt-3 flex items-center gap-2 max-w-sm">
          <Progress value={(n / course.lessons.length) * 100} className="h-1.5 flex-1" />
          <span className="text-xs tabular-nums">{n}/{course.lessons.length}</span>
        </div>
      </div>
      {course.id === 'product' && isDirector && (
        <div className="rounded-xl border border-dashed p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground flex-1 min-w-[200px]">Уроки показывают страницы «Памятки для менеджеров». Если обновилась памятка — загрузите новый файл.</span>
          <HandbookUpload onDone={() => toast.success('Страницы обновятся при открытии урока')} />
        </div>
      )}
      <div className="rounded-2xl border divide-y overflow-hidden">
        {course.lessons.map((l, i) => {
          const r = rows.find(x => x.lesson_id === l.id);
          const ok = done.has(l.id);
          return (
            <button key={l.id} type="button" onClick={() => onLesson(l.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition">
              {ok ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" /> : <Circle size={20} className="text-muted-foreground/50 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium"><span className="text-muted-foreground mr-1.5 tabular-nums">{i + 1}.</span>{l.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1"><Clock size={11} />{l.minutes} мин</span>
                  {l.reference ? <span>· справочник</span> : <span>· тест {l.quiz?.length ?? 0} вопр.</span>}
                  {r && !l.reference && <span>· лучший результат {r.best_score}/{r.total}</span>}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Урок ────────────────────────────────────────────────────────────────────
function LessonView({ course, lesson, done, onSubmit, onNav }: {
  course: Course; lesson: Lesson; done: Set<string>;
  onSubmit: (id: string, s: number, t: number) => Promise<void>; onNav: (to: string | null) => void;
}) {
  const idx = course.lessons.findIndex(l => l.id === lesson.id);
  const prev = course.lessons[idx - 1];
  const next = course.lessons[idx + 1];
  const ok = done.has(lesson.id);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [lesson.id]);
  return (
    <div className="space-y-6 max-w-4xl">
      <button type="button" onClick={() => onNav(course.id)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"><ChevronLeft size={16} />{course.title}</button>
      <div>
        <p className="text-xs text-muted-foreground">Урок {idx + 1} из {course.lessons.length} · {lesson.minutes} мин</p>
        <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">{lesson.title}{ok && <CheckCircle2 size={20} className="text-emerald-600" />}</h1>
      </div>

      <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20 p-4">
        <p className="text-sm font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300"><Sparkles size={15} />Главное за 30 секунд</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {lesson.summary.map((s, i) => <li key={i} className="flex gap-2"><span className="text-amber-600">•</span><span>{s}</span></li>)}
        </ul>
      </div>

      {lesson.body && <div className="max-w-3xl"><RichText text={lesson.body} /></div>}

      {lesson.pages && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Памятка, стр. {lesson.pages[0]}–{lesson.pages[1]}</p>
          <HandbookPages from={lesson.pages[0]} to={lesson.pages[1]} />
        </div>
      )}

      {lesson.quiz && lesson.quiz.length > 0 ? (
        <div className="space-y-3 max-w-3xl">
          <h2 className="text-lg font-semibold">Тест</h2>
          <p className="text-sm text-muted-foreground -mt-2">Для зачёта нужно 80 % правильных ответов.</p>
          <Quiz key={lesson.id} questions={lesson.quiz} onSubmit={(s, t) => onSubmit(lesson.id, s, t)} />
        </div>
      ) : (
        <Button variant={ok ? 'outline' : 'default'} disabled={ok} onClick={() => onSubmit(lesson.id, 1, 1)}>
          <CheckCircle2 size={16} className="mr-1.5" />{ok ? 'Изучено' : 'Отметить как изученное'}
        </Button>
      )}

      <div className="flex justify-between gap-3 pt-4 border-t">
        {prev ? <Button variant="ghost" onClick={() => onNav(`${course.id}/${prev.id}`)}><ChevronLeft size={16} className="mr-1" />{prev.title}</Button> : <span />}
        {next ? <Button variant="ghost" onClick={() => onNav(`${course.id}/${next.id}`)}>{next.title}<ChevronRight size={16} className="ml-1" /></Button>
          : <Button variant="ghost" onClick={() => onNav(null)}>К списку курсов<ChevronRight size={16} className="ml-1" /></Button>}
      </div>
    </div>
  );
}

// ─── Тренажёр карточек ───────────────────────────────────────────────────────
function Trainer({ onBack, onFinish, done }: { onBack: () => void; onFinish: (s: number, t: number) => Promise<void>; done: boolean }) {
  const [mode, setMode] = useState<'cards' | 'list'>('cards');
  const [topic, setTopic] = useState<string>('Все');
  const topics = ['Все', ...Array.from(new Set(QA_CARDS.map(c => c.topic)))];
  const deck = useMemo(() => QA_CARDS.filter(c => topic === 'Все' || c.topic === topic), [topic]);
  const [queue, setQueue] = useState<string[]>(deck.map(c => c.id));
  const [firstTry, setFirstTry] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [flipped, setFlipped] = useState(false);
  const [saved, setSaved] = useState(false);

  const restart = useCallback(() => {
    setQueue([...deck.map(c => c.id)].sort(() => Math.random() - 0.5));
    setFirstTry(new Set()); setMissed(new Set()); setFlipped(false); setSaved(false);
  }, [deck]);
  useEffect(() => { restart(); }, [restart]);

  const card = QA_CARDS.find(c => c.id === queue[0]);
  const finished = queue.length === 0;
  const total = deck.length;

  useEffect(() => {
    if (finished && !saved && topic === 'Все' && total > 0) {
      setSaved(true);
      onFinish(firstTry.size, total);
    }
  }, [finished, saved, topic, total, firstTry, onFinish]);

  function know() {
    if (!card) return;
    if (!missed.has(card.id)) setFirstTry(s => new Set(s).add(card.id));
    setQueue(q => q.slice(1)); setFlipped(false);
  }
  function again() {
    if (!card) return;
    setMissed(s => new Set(s).add(card.id));
    setQueue(q => [...q.slice(1), card.id]); setFlipped(false);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"><ChevronLeft size={16} />Все курсы</button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">Тренажёр «Вопрос клиента — ответ»{done && <CheckCircle2 size={18} className="text-emerald-600" />}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Прочитайте вопрос, ответьте вслух, переверните карточку и сверьтесь.</p>
        </div>
        <div className="flex rounded-lg border p-0.5">
          <button type="button" onClick={() => setMode('cards')} className={`h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${mode === 'cards' ? 'bg-muted font-medium' : ''}`}><Layers size={14} />Карточки</button>
          <button type="button" onClick={() => setMode('list')} className={`h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${mode === 'list' ? 'bg-muted font-medium' : ''}`}><List size={14} />Все ответы</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {topics.map(t => (
          <button key={t} type="button" onClick={() => setTopic(t)}
            className={`h-8 px-3 rounded-full text-sm border ${topic === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>{t}</button>
        ))}
      </div>

      {mode === 'list' ? (
        <div className="space-y-3">
          {deck.map((c, i) => (
            <div key={c.id} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{c.topic}</p>
              <p className="font-medium mt-0.5">{i + 1}. «{c.q}»</p>
              <p className="text-sm mt-2 leading-relaxed">{c.a}</p>
            </div>
          ))}
        </div>
      ) : finished ? (
        <div className="rounded-2xl border p-8 text-center space-y-3">
          <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
          <p className="text-lg font-semibold">Колода пройдена!</p>
          <p className="text-sm text-muted-foreground">С первого раза: {firstTry.size} из {total}.{topic !== 'Все' && ' Чтобы тренажёр засчитался, пройдите колоду «Все».'}{topic === 'Все' && (firstTry.size * 100 >= total * 80 ? ' Тренажёр засчитан.' : ' Для зачёта нужно 80 % с первого раза — попробуйте ещё.')}</p>
          <Button onClick={restart}><RotateCcw size={14} className="mr-1.5" />Пройти ещё раз</Button>
        </div>
      ) : card && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Progress value={((total - new Set(queue).size) / total) * 100} className="h-1.5 flex-1" />
            <span className="tabular-nums">осталось {new Set(queue).size}</span>
          </div>
          <button type="button" onClick={() => setFlipped(f => !f)}
            className={`w-full min-h-[260px] rounded-2xl border p-6 text-left transition-colors flex flex-col ${flipped ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-card hover:border-primary/40'}`}>
            <span className="text-xs text-muted-foreground">{card.topic} · {flipped ? 'ответ' : 'клиент спрашивает'}</span>
            {flipped
              ? <p className="mt-3 text-[15px] leading-relaxed flex-1">{card.a}</p>
              : <p className="mt-6 text-2xl font-semibold flex-1">«{card.q}»</p>}
            {!flipped && <span className="text-xs text-primary">Ответьте вслух и нажмите, чтобы проверить →</span>}
          </button>
          {flipped && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={again}><Repeat size={15} className="mr-1.5" />Повторить</Button>
              <Button onClick={know}><ThumbsUp size={15} className="mr-1.5" />Знаю</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Прогресс команды (директор / РОП) ───────────────────────────────────────
function TeamView({ rows, onBack }: { rows: ProgressRow[]; onBack: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { getAllProfiles().then(setProfiles).catch(() => {}); }, []);
  const people = profiles.filter(p => p.role !== 'director' || rows.some(r => r.user_id === p.id));
  const total = ALL_ITEMS.length;

  return (
    <div className="space-y-5 max-w-4xl">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"><ChevronLeft size={16} />Все курсы</button>
      <div>
        <h1 className="text-xl font-semibold">Прогресс команды</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Кто какие уроки прошёл и с каким результатом. Нажмите на сотрудника, чтобы увидеть детали.</p>
      </div>
      <div className="rounded-2xl border divide-y overflow-hidden">
        {people.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Загрузка…</div>}
        {people.map(p => {
          const mine = rows.filter(r => r.user_id === p.id);
          const passed = new Set(mine.filter(r => r.passed).map(r => r.lesson_id));
          const n = ALL_ITEMS.filter(i => passed.has(i.id)).length;
          const last = mine.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
          const isOpen = open === p.id;
          return (
            <div key={p.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/40">
                <UserAvatar name={p.name} url={p.avatar_url} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{last ? `последняя активность ${fmtDate(last)}` : 'ещё не начинал(а)'}</p>
                </div>
                <div className="w-40 hidden sm:flex items-center gap-2">
                  <Progress value={(n / total) * 100} className="h-1.5 flex-1" />
                </div>
                <span className={`text-sm font-semibold tabular-nums w-14 text-right ${n === total ? 'text-emerald-600' : ''}`}>{n}/{total}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-muted/20">
                  {[...COURSES.map(c => ({ title: c.title, items: c.lessons.map(l => ({ id: l.id, title: l.title, ref: !!l.reference })) }))].map(g => (
                    <div key={g.title} className="mt-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{g.title}</p>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                        {g.items.map(it => {
                          const r = mine.find(x => x.lesson_id === it.id);
                          return (
                            <div key={it.id} className="flex items-center gap-2 text-sm">
                              {r?.passed ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : r ? <RotateCcw size={14} className="text-amber-600 shrink-0" /> : <Circle size={14} className="text-muted-foreground/40 shrink-0" />}
                              <span className="flex-1 truncate">{it.title}</span>
                              {r && !it.ref && <span className="text-xs text-muted-foreground tabular-nums">{r.best_score}/{r.total}{r.attempts > 1 ? ` · ${r.attempts} поп.` : ''}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Страница ────────────────────────────────────────────────────────────────
export default function TrainingPage() {
  const { user, canViewAllManagers } = useAuth();
  const [params, setParams] = useSearchParams();
  const { rows, submit } = useProgress();
  const view = params.get('v'); // null | 'trainer' | 'team' | '<course>' | '<course>/<lesson>'

  const myRows = useMemo(() => rows.filter(r => r.user_id === user?.id), [rows, user?.id]);
  const done = useMemo(() => new Set(myRows.filter(r => r.passed).map(r => r.lesson_id)), [myRows]);
  const go = (v: string | null) => { setParams(v ? { v } : {}); };

  const [courseId, lessonId] = (view ?? '').split('/');
  const course = COURSES.find(c => c.id === courseId);
  const lesson = course?.lessons.find(l => l.id === lessonId);
  const finishTrainer = useCallback((s: number, t: number) => submit(QA_TRAINER_ID, s, t), [submit]);

  let content;
  if (view === 'trainer') content = <Trainer onBack={() => go(null)} onFinish={finishTrainer} done={done.has(QA_TRAINER_ID)} />;
  else if (view === 'team' && canViewAllManagers) content = <TeamView rows={rows} onBack={() => go(null)} />;
  else if (course && lesson) content = <LessonView course={course} lesson={lesson} done={done} onSubmit={submit} onNav={go} />;
  else if (course) content = <CourseView course={course} done={done} rows={myRows} onLesson={id => go(`${course.id}/${id}`)} onBack={() => go(null)} />;
  else content = <Home done={done} onCourse={go} onTrainer={() => go('trainer')} onTeam={() => go('team')} canTeam={canViewAllManagers} trainerDone={done.has(QA_TRAINER_ID)} />;

  return <AppLayout>{content}</AppLayout>;
}
