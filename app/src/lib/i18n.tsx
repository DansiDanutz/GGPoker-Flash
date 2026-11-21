import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  const [dictionary, setDictionary] = useState<Dict | null>(null);
  useEffect(() => {
    if (lang === 'en' || dictionary) return;
    let active = true;
    import('./i18n-dict.json').then(({ default: data }) => {
      if (active) setDictionary(data);
    }).catch(() => { /* Keep the English UI available offline. */ });
    return () => { active = false; };
  }, [lang, dictionary]);
  const originals = useRef(new WeakMap<Text, string>()).current;
  const applying = useRef(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  const translateText = useCallback((node: Text) => {
    const current = node.nodeValue;
    if (!current) return;
    const trimmed = current.trim();
    if (!trimmed) return;
    const previous = originals.get(node);
    if (previous && dictionary?.[previous.trim()]?.[langRef.current] === trimmed) return;
    originals.delete(node);
    const entry = dictionary?.[trimmed];
    if (!entry) return;
    if (langRef.current === 'en') {
      const orig = originals.get(node);
      if (orig != null && current !== orig) node.nodeValue = orig;
      return;
    }
    const translated = entry[langRef.current];
    if (!translated || translated === trimmed) return;
    originals.set(node, current);
    if (current !== translated) {
      const lead = current.match(/^\s*/)?.[0] || '';
      const trail = current.match(/\s*$/)?.[0] || '';
      node.nodeValue = lead + translated + trail;
    }
  }, [dictionary, originals]);

  const translateAttrs = useCallback((el: Element) => {
    if (SKIP_TAGS.has(el.tagName)) return;
    for (const attr of ATTRS) {
      const val = el.getAttribute(attr);
      const key = `data-i18n-${attr}`;
      const previous = el.getAttribute(key);
      if (previous && dictionary?.[previous]?.[langRef.current] === val) continue;
      el.removeAttribute(key);
      if (!val) continue;
      const entry = dictionary?.[val];
      if (!entry) continue;
      if (langRef.current === 'en') {
        const orig = el.getAttribute(key);
        if (orig != null) { el.setAttribute(attr, orig); el.removeAttribute(key); }
      } else {
        const translated = entry[langRef.current];
        if (translated && translated !== val) {
          el.setAttribute(key, val);
          el.setAttribute(attr, translated);
        }
      }
    }
  }, [dictionary]);

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

  // Initial translation + observe React updates.
  useEffect(() => {
    document.documentElement.lang = langRef.current;
    document.documentElement.dir = langRef.current === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'en' || !dictionary) return;
    scan(document.body);
    const obs = new MutationObserver(records => {
      const roots = new Set<Node>();
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(node => roots.add(node));
        else if (record.type === 'characterData') roots.add(record.target);
        else {
          const el = record.target as Element;
          if (el.isConnected && !el.closest('script,style,textarea,code,pre')) translateAttrs(el);
        }
      }
      for (const node of roots) {
        if (!node.parentElement?.closest('script,style,textarea,code,pre')) scan(node);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => obs.disconnect();
  }, [lang, dictionary, scan, translateAttrs]);

  const setLang = useCallback((code: string) => {
    localStorage.setItem('ggpoker.language', code);
    const previousLang = langRef.current;
    setLangState(code);
    langRef.current = code;
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    // restore all live translated nodes, then retranslate from scratch
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let next = walker.nextNode(); next; next = walker.nextNode()) {
      const node = next as Text;
      const orig = originals.get(node);
      if (orig != null && node.nodeValue?.trim() === dictionary?.[orig.trim()]?.[previousLang]) node.nodeValue = orig;
      originals.delete(node);
    }
    document.querySelectorAll('[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label]').forEach((el) => {
      for (const attr of ATTRS) {
        const key = `data-i18n-${attr}`;
        const orig = el.getAttribute(key);
        if (orig != null) {
          if (el.getAttribute(attr) === dictionary?.[orig]?.[previousLang]) el.setAttribute(attr, orig);
          el.removeAttribute(key);
        }
      }
    });
  }, [dictionary, originals]);

  const t = useCallback((text: string) => {
    if (lang === 'en') return text;
    return dictionary?.[text]?.[lang] || text;
  }, [lang, dictionary]);

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
