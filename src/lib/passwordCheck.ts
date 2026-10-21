/**
 * Проверка пароля на надёжность — замена платной функции Supabase
 * «защита от утёкших паролей». Не пускает самые распространённые пароли,
 * которые первыми пробуют при взломе.
 */
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344',
  '123123123', '1q2w3e4r', '1q2w3e4r5t', 'q1w2e3r4', 'qwerty12', 'qwerty123', 'qwertyui', 'qwerty1234',
  'password', 'password1', 'password123', 'passw0rd', 'pass1234', 'admin123', 'admin1234', 'administrator',
  'iloveyou', 'abc12345', 'abcd1234', 'asdf1234', 'zxcv1234', 'asdfghjk', 'zxcvbnm1', 'welcome1',
  'letmein1', 'monkey12', 'dragon12', 'sunshine', 'princess', 'football', 'baseball', 'superman',
  'qazwsxedc', '1qaz2wsx', 'aa123456', 'a1234567', 'a12345678', 'parol123', 'privet123', 'kazakhstan',
  'shymkent', 'shymkent1', 'almaty123', 'astana123', 'profildoors', 'profildoors1', 'profil123', 'afinance',
  'a-finance', 'afinance1', 'doors123', 'dveri123', 'alliance', 'alyans123',
]);

/** Возвращает причину, почему пароль слабый, или null, если пароль подходит */
export function weakPasswordReason(pw: string): string | null {
  if (pw.length < 8) return 'Пароль — минимум 8 символов';
  if (!/[a-zа-яё]/i.test(pw) || !/\d/.test(pw)) return 'Пароль должен содержать и буквы, и цифры';
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return 'Этот пароль слишком распространённый — его легко подобрать. Придумайте другой';
  if (/^(.)\1+$/.test(low)) return 'Пароль из одинаковых символов слишком простой';
  // «abc123456», «q12345678» — пара букв + цифры подряд
  const digits = low.replace(/\D/g, '');
  const letters = low.replace(/[^a-zа-яё]/gi, '');
  const sequential = '01234567890123456789'.includes(digits) || '98765432109876543210'.includes(digits) || /^(\d)\1+$/.test(digits);
  if (digits.length >= 6 && letters.length <= 3 && sequential) return 'Пароль из подряд идущих цифр слишком простой';
  return null;
}
