import { useEffect, useMemo, useState } from 'react';
import type { Lang } from './backend/types';
import { I18nContext, makeI18n } from './i18n';
import Home from './screens/Home';
import Host from './screens/Host';
import Participant from './screens/Participant';
import Presentation from './screens/Presentation';

function readLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'ar' || q === 'en') return q;
    const s = localStorage.getItem('metr.lang');
    if (s === 'ar' || s === 'en') return s;
  } catch { /* storage unavailable */ }
  return 'en';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(readLang);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('metr.lang', lang); } catch { /* ignore */ }
  }, [lang]);

  const i18n = useMemo(() => makeI18n(lang, setLang), [lang]);
  useEffect(() => { document.title = i18n.t('appName'); }, [i18n]);

  const route = path.replace(/\/+$/, '') || '/';
  let page;
  if (route === '/host') page = <Host />;
  else if (route === '/join') page = <Participant />;
  else if (route === '/screen') page = <Presentation />;
  else page = <Home />;

  return <I18nContext.Provider value={i18n}>{page}</I18nContext.Provider>;
}
