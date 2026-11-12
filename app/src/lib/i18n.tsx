import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import dict from './i18n-dict.json';
import { subscribePrefs } from './prefsSync';

export const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'ro', label: 'Română' }, { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' }, { code: 'es', label: 'Español' }, { code: 'pt-br', label: 'Português' },
  { code: 'ru', label: 'Русский' }, { code: 'zh-cn', label: '中文' }, { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }, { code: 'tr', label: 'Türkçe' }, { code: 'pl', label: 'Polski' },
  { code: 'zh-tw', label: '繁體中文' }, { code: 'vi', label: 'Tiếng Việt' }, { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'th', label: 'ไทย' }, { code: 'sv', label: 'Svenska' }, { code: 'et', label: 'Eesti' },
  { code: 'lv', label: 'Latviešu' }, { code: 'da', label: 'Dansk' }, { code: 'fi', label: 'Suomi' },
  { code: 'cs', label: 'Čeština' }, { code: 'nl', label: 'Nederlands' }, { code: 'hu', label: 'Magyar' },
  { code: 'uk-ua', label: 'Українська' }, { code: 'lt', label: 'Lietuvių' }, { code: 'ar', label: 'العربية' },
  { code: 'bs-ba', label: 'Bosanski' }, { code: 'bg', label: 'Български' }, { code: 'el', label: 'Ελληνικά' },
];

type Dict = Record<string, Record<string, string>>;
const DICT = dict as Dict;

type Ctx = {
  lang: string;
  setLang: (code: string) => void;
  t: (text: string) => string;
  languages: { code: string; label: string }[];
};

const I18nCtx = createContext<Ctx | null>(null);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'title', 'aria-label'];

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(() => localStorage.getItem('ggpoker.language') || 'en');
  const originals = useRef(new Map<Text, string>()).current;
  const applying = useRef(false);
  const scheduled = useRef<number | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const translateText = useCallback((node: Text) => {
    const current = node.nodeValue;
    if (!current) return;
    const trimmed = current.trim();
    if (!trimmed) return;
    const entry = DICT[trimmed];
    if (!entry) return;
    if (langRef.current === 'en') {
      const orig = originals.get(node);
      if (orig != null && current !== orig) node.nodeValue = orig;
      return;
    }
    const translated = entry[langRef.current];
    if (!translated || translated === trimmed) return;
    if (!originals.has(node)) originals.set(node, current);
    if (current !== translated) {
      const lead = current.match(/^\s*/)?.[0] || '';
      const trail = current.match(/\s*$/)?.[0] || '';
      node.nodeValue = lead + translated + trail;
    }
  }, [originals]);

  const translateAttrs = useCallback((el: Element) => {
    if (SKIP_TAGS.has(el.tagName)) return;
    for (const attr of ATTRS) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      const entry = DICT[val];
      if (!entry) continue;
      const key = `data-i18n-${attr}`;
      if (langRef.current === 'en') {
        const orig = el.getAttribute(key);
        if (orig != null) { el.setAttribute(attr, orig); el.removeAttribute(key); }
      } else {
        const translated = entry[langRef.current];
        if (translated && translated !== val) {
          if (!el.getAttribute(key)) el.setAttribute(key, val);
          el.setAttribute(attr, translated);
        }
      }
    }
  }, []);

  const scan = useCallback((root: Node) => {
    if (applying.current) return;
    if (!document.body.contains(root) && root !== document.body) return;
    applying.current = true;
    try {
      if (root.nodeType === Node.TEXT_NODE) {
        translateText(root as Text);
      } else if (root.nodeType === Node.ELEMENT_NODE) {
        const el = root as Element;
        if (SKIP_TAGS.has(el.tagName)) return;
        translateAttrs(el);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let n: Node | null = walker.currentNode;
        while (n) {
          if (n.nodeType === Node.TEXT_NODE) translateText(n as Text);
          else if (n.nodeType === Node.ELEMENT_NODE) {
            const e2 = n as Element;
            if (SKIP_TAGS.has(e2.tagName)) { n = walker.nextSibling(); continue; }
            translateAttrs(e2);
          }
          n = walker.nextNode();
        }
      }
    } finally {
      applying.current = false;
    }
  }, [translateAttrs, translateText]);

  const schedule = useCallback(() => {
    if (scheduled.current) return;
    scheduled.current = window.setTimeout(() => {
      scheduled.current = null;
      scan(document.body);
    }, 90);
  }, [scan]);

  // Initial translation + observe React updates.
  useEffect(() => {
    document.documentElement.lang = langRef.current;
    document.documentElement.dir = langRef.current === 'ar' ? 'rtl' : 'ltr';
    scan(document.body);
    const timers = [120, 600, 1600, 3200, 6000].map((ms) => window.setTimeout(() => scan(document.body), ms));
    const obs = new MutationObserver(() => {
      schedule();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => {
      obs.disconnect();
      timers.forEach((t) => clearTimeout(t));
      if (scheduled.current) clearTimeout(scheduled.current);
    };
  }, [scan, schedule]);

  const setLang = useCallback((code: string) => {
    localStorage.setItem('ggpoker.language', code);
    setLangState(code);
    langRef.current = code;
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    // restore all translated nodes, then retranslate from scratch
    for (const [node, orig] of originals) {
      if (node.isConnected) node.nodeValue = orig;
    }
    originals.clear();
    document.querySelectorAll('[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label]').forEach((el) => {
      for (const attr of ATTRS) {
        const key = `data-i18n-${attr}`;
        const orig = el.getAttribute(key);
        if (orig != null) { el.setAttribute(attr, orig); el.removeAttribute(key); }
      }
    });
    // force a fresh render pass so new text nodes get picked up
    window.setTimeout(() => scan(document.body), 0);
  }, [originals, scan]);

  const t = useCallback((text: string) => {
    if (lang === 'en') return text;
    return DICT[text]?.[lang] || text;
  }, [lang]);

  // A language restored from the account or chosen in another window applies here too.
  useEffect(() => subscribePrefs(['ggpoker.language'], () => {
    const saved = localStorage.getItem('ggpoker.language') || 'en';
    if (saved !== langRef.current) setLang(saved);
  }), [setLang]);

  const value = useMemo<Ctx>(() => ({ lang, setLang, t, languages: LANGS }), [lang, setLang, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const v = useContext(I18nCtx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
