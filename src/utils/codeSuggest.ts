/**
 * 이름(입고처명/출고처명) 기반으로 코드 후보를 생성한다.
 *
 * 규칙:
 *   1) 괄호 안 (주, 株 등) 제거
 *   2) 영문 단어 포함 시 첫 단어를 대문자화 (TechSupply → TECH)
 *   3) 순수 한글 → 각 음절 초성 로마자 변환 (대한전자 → DHJ)
 *   4) 길이 maxLen 으로 자르기
 *
 * 결과는 어디까지나 "초안" — 사용자가 수정할 수 있다는 전제.
 */
const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const INITIAL_TO_ROMAN: Record<string, string> = {
  'ㄱ': 'G', 'ㄲ': 'KK', 'ㄴ': 'N', 'ㄷ': 'D', 'ㄸ': 'TT',
  'ㄹ': 'R', 'ㅁ': 'M', 'ㅂ': 'B', 'ㅃ': 'PP', 'ㅅ': 'S',
  'ㅆ': 'SS', 'ㅇ': '',  'ㅈ': 'J', 'ㅉ': 'JJ', 'ㅊ': 'CH',
  'ㅋ': 'K', 'ㅌ': 'T', 'ㅍ': 'P', 'ㅎ': 'H',
};

function koreanInitial(char: string): string {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '';
  const idx = Math.floor((code - 0xAC00) / 588);
  return INITIAL_TO_ROMAN[INITIALS[idx]] ?? '';
}

export function suggestCodeFromName(name: string, maxLen = 8): string {
  if (!name) return '';
  const cleaned = name.replace(/\([^)]*\)/g, '').trim();
  if (!cleaned) return '';

  // 카멜케이스 분리: TechSupply → "Tech Supply"
  const spaced = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');

  // 영문 단어 (2자 이상) 우선 — 첫 단어 대문자화
  const englishWord = spaced.match(/[A-Za-z][A-Za-z0-9]+/);
  if (englishWord) {
    return englishWord[0].toUpperCase().slice(0, maxLen);
  }

  // 한글 초성 로마자
  let romanized = '';
  for (const ch of cleaned) {
    if (romanized.length >= maxLen) break;
    if (/[\uAC00-\uD7A3]/.test(ch)) {
      romanized += koreanInitial(ch);
    }
  }
  return romanized.slice(0, maxLen);
}
