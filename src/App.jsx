import { useEffect, useState } from 'react';
import childrenGroup from './image/c-est-pour-venir-en-aide-aux-enfants-orphelins-du-togo-que-l-association-espoir-vie-togo-france-organise-son-expo-vente-dr-1596705081.jpg';
import childrenPortrait from './image/images.jpg';
import childrenFriends from './image/istockphoto-640305394-612x612.jpg';
import { supabase } from './lib/src/lib/supabaseClient.js';
import './App.css';

const neighborhoods = ['Mikeno', 'Mapendo', 'Les Volcans', 'Katindo', 'Kyeshero', 'Himbi', 'Lac-Vert', 'Kahembe', 'Katoyi', 'Majengo', 'Mabanga-Nord', 'Mabanga-Sud', 'Kasika', 'Murara', 'Virunga', 'Ndosho', 'Mugunga', 'Bujovu'];
const categories = ['Violence physique', 'Violence sexuelle', 'Violence psychologique', 'Maltraitance ou abus', 'Négligence ou abandon', 'Harcèlement ou intimidation', 'Exploitation ou travail des enfants', 'Mariage forcé ou grossesse précoce', 'Enlèvement ou disparition', 'Enfant séparé ou déplacé', 'Situation de handicap ou besoin médical', 'Autre inquiétude'];
const trackingSteps = [
  { status: 'Nouveau', title: 'Signalement reçu', description: 'Le dossier est enregistré et attend une première évaluation.' },
  { status: 'En évaluation', title: 'Évaluation', description: 'Les besoins de protection et les actions prioritaires sont analysés.' },
  { status: 'Accompagnement', title: 'Accompagnement', description: 'Les services compétents organisent la suite de la prise en charge.' },
  { status: 'Clôturé', title: 'Dossier clôturé', description: 'Le suivi de ce dossier est terminé.' },
];
const emptyForm = { category: '', location: '', details: '', contact: '' };

function getAdminLoginError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Ce compte existe, mais son adresse e-mail doit être confirmée dans Supabase Authentication.';
  }
  if (code === 'too_many_requests' || code === 'over_request_rate_limit' || error?.status === 429) {
    return 'Trop de tentatives de connexion. Attendez quelques minutes avant de réessayer.';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials') || error?.status === 400) {
    return 'Supabase a refusé ces identifiants. Vérifiez le mot de passe et que ce compte existe dans Authentication → Users du même projet Supabase que cette application.';
  }
  if (error?.status === 0 || message.includes('fetch') || message.includes('network')) {
    return 'Le serveur Supabase est injoignable. Vérifiez l’URL et la clé publique du projet dans .env, puis redémarrez Vite.';
  }
  return `Connexion refusée par Supabase${error?.status ? ` (erreur ${error.status})` : ''}. Vérifiez la configuration du projet et consultez Authentication → Logs dans Supabase.`;
}

function App() {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const isAdmin = currentPath === '/admin';
  const page = ({
    '/': 'home',
    '/mission': 'mission',
    '/carte': 'map',
    '/suivi': 'tracking',
    '/signaler': 'report',
    '/contact': 'contact',
  })[currentPath] || 'home';
  const [theme, setTheme] = useState(() => (
    window.localStorage.getItem('enfancesure-theme') === 'dark' ? 'dark' : 'light'
  ));
  const [form, setForm] = useState(emptyForm);
  const [reference, setReference] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [trackingMessage, setTrackingMessage] = useState('');
  const [trackingStatus, setTrackingStatus] = useState('');
  const [adminFilter, setAdminFilter] = useState('Tous');
  const [adminSession, setAdminSession] = useState(null);
  const [adminCredentials, setAdminCredentials] = useState({ email: '', password: '' });
  const [adminStatus, setAdminStatus] = useState('signed-out');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportError, setReportError] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [updatingReportId, setUpdatingReportId] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('enfancesure-theme', theme);
  }, [theme]);

  useEffect(() => {
    const pageTitles = {
      home: 'Accueil',
      mission: 'Notre mission',
      map: 'Carte de Goma',
      tracking: 'Suivre un dossier',
      report: 'Signaler une situation',
      contact: 'Contact',
    };
    document.title = `${pageTitles[page]} — EnfanceSûre`;
  }, [page]);

  useEffect(() => {
    if (!isAdmin || !supabase) return undefined;

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active) {
        setAdminSession(session);
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
          setAdminStatus('recovery');
          setRecoveryMessage('Choisis un nouveau mot de passe pour ton compte administrateur.');
        } else {
          setAdminStatus(session ? 'checking' : 'signed-out');
        }
        setAdminError('');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setAdminSession(data.session);
        setAdminStatus(data.session ? 'checking' : 'signed-out');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !adminSession || !supabase) return undefined;

    let active = true;
    const channel = supabase
      .channel('admin-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, ({ eventType, new: report }) => {
        if (!active || eventType === 'DELETE') return;
        setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
      })
      .subscribe();

    const loadAdminReports = async () => {
      const { data: membership, error: membershipError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', adminSession.user.id)
        .maybeSingle();

      if (!active) return;
      if (membershipError || !membership) {
        setAdminStatus('unauthorized');
        setAdminError(membershipError ? 'Impossible de vérifier les droits administrateur.' : 'Ce compte n’a pas accès aux signalements.');
        return;
      }

      const { data, error } = await supabase
        .from('reports')
        .select('id, reference, category, neighborhood, details, contact, status, created_at')
        .order('created_at', { ascending: false });

      if (!active) return;
      if (error) {
        setAdminStatus('unauthorized');
        setAdminError('Les signalements ne peuvent pas être chargés. Vérifiez la configuration Supabase.');
        return;
      }

      setReports((current) => [...current.filter((report) => !data.some((item) => item.id === report.id)), ...data]);
      setAdminStatus('authorized');
    };

    loadAdminReports();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [adminSession, isAdmin]);

  const filteredRecords = adminFilter === 'Tous'
    ? reports
    : reports.filter((record) => record.status === adminFilter);

  const updateForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setReportError('');
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!supabase) {
      setReportError('L’envoi est momentanément indisponible.');
      return;
    }

    setReportSubmitting(true);
    setReportError('');
    const generatedReference = `ES-${crypto.randomUUID().toUpperCase()}`;
    const { error } = await supabase.from('reports').insert({
      reference: generatedReference,
      category: form.category,
      neighborhood: form.location,
      details: form.details.trim(),
      contact: form.contact.trim() || null,
    });

    setReportSubmitting(false);
    if (error) {
      setReportError('Le signalement n’a pas pu être envoyé. Réessayez dans quelques instants.');
      return;
    }

    setReference(generatedReference);
    setForm(emptyForm);
  };

  const signInAdmin = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    setAdminLoading(true);
    setAdminError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: adminCredentials.email.trim(),
        password: adminCredentials.password,
      });
      if (error) setAdminError(getAdminLoginError(error));
    } catch (error) {
      setAdminError(getAdminLoginError(error));
    } finally {
      setAdminLoading(false);
    }
  };

  const sendAdminPasswordRecovery = async () => {
    if (!supabase || !adminCredentials.email.trim()) {
      setAdminError('Saisis d’abord l’adresse e-mail de ton compte administrateur.');
      return;
    }
    setAdminLoading(true);
    setAdminError('');
    setRecoveryEmailSent(false);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(adminCredentials.email.trim(), {
        redirectTo: `${window.location.origin}/admin`,
      });
      if (error) {
        setAdminError(error.message.toLowerCase().includes('redirect')
          ? 'Supabase bloque le retour vers cette adresse. Ajoute l’adresse de la plateforme dans Authentication → URL Configuration → Redirect URLs.'
          : 'Impossible d’envoyer le lien de récupération. Vérifie la configuration e-mail de Supabase et réessaie.');
        return;
      }
      setRecoveryEmailSent(true);
    } catch {
      setAdminError('Supabase est injoignable pour le moment. Vérifie ta connexion puis réessaie.');
    } finally {
      setAdminLoading(false);
    }
  };

  const updateAdminPassword = async (event) => {
    event.preventDefault();
    if (!supabase) return;
    setRecoveryLoading(true);
    setRecoveryMessage('');
    const { error } = await supabase.auth.updateUser({ password: newAdminPassword });
    setRecoveryLoading(false);
    if (error) {
      setRecoveryMessage(error.message.toLowerCase().includes('password')
        ? 'Le mot de passe ne respecte pas les exigences de sécurité. Choisis-en un autre.'
        : 'Le lien de récupération a peut-être expiré. Demande un nouveau lien depuis la page de connexion.');
      return;
    }
    setPasswordRecovery(false);
    setNewAdminPassword('');
    setRecoveryMessage('Mot de passe modifié. Tu es maintenant connecté à ton espace administrateur.');
    setAdminStatus('checking');
  };

  const signOutAdmin = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setReports([]);
    setAdminStatus('signed-out');
  };

  const trackReport = async (event) => {
    event.preventDefault();
    setTrackingMessage('');
    setTrackingStatus('');
    if (!supabase) {
      setTrackingMessage('Le suivi est momentanément indisponible.');
      return;
    }

    const { data: status, error } = await supabase.rpc('track_report', {
      report_reference: trackingReference.trim().toUpperCase(),
    });
    if (error) {
      setTrackingMessage('Le suivi est momentanément indisponible. Réessayez plus tard.');
      return;
    }
    if (status) {
      setTrackingStatus(status);
      setTrackingMessage('Votre dossier a été retrouvé. Voici son état actuel.');
    } else {
      setTrackingMessage('Référence introuvable. Vérifiez la référence reçue et réessayez.');
    }
  };

  const updateReportStatus = async (reportId, status) => {
    if (!supabase) return;
    setUpdatingReportId(reportId);
    setReportError('');
    const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);
    setUpdatingReportId('');
    if (error) {
      setReportError('Le statut n’a pas pu être modifié. Vérifiez les droits Supabase puis réessayez.');
      return;
    }
    setReports((current) => current.map((item) => item.id === reportId ? { ...item, status } : item));
  };


  return (
    <div className={`app-shell ${isAdmin ? 'admin-mode' : ''}`} data-theme={theme}>
      <header className="navbar">
        <a className="logo" href="/" aria-label="EnfanceSûre, accueil">
          <span className="logo-icon" aria-hidden="true">✦</span>
          <span>Enfance<span className="logo-accent">Sûre</span></span>
        </a>
        <nav aria-label="Navigation principale">
          <a href="/" aria-current={page === 'home' ? 'page' : undefined}>Accueil</a>
          <a href="/mission" aria-current={page === 'mission' ? 'page' : undefined}>Notre mission</a>
          <a href="/carte" aria-current={page === 'map' ? 'page' : undefined}>Carte</a>
          <a href="/suivi" aria-current={page === 'tracking' ? 'page' : undefined}>Suivi</a>
          <a href="/contact" aria-current={page === 'contact' ? 'page' : undefined}>Contact</a>
        </nav>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          aria-label={`Activer le mode ${theme === 'dark' ? 'clair' : 'sombre'}`}
          aria-pressed={theme === 'dark'}
          title={`Activer le mode ${theme === 'dark' ? 'clair' : 'sombre'}`}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
        <a href="/signaler" className="nav-button" aria-current={page === 'report' ? 'page' : undefined}>Signaler</a>
      </header>

      <main>
        {page === 'home' && <>
        <section className="hero" id="accueil">
          <div className="hero-content"><div className="hero-copy-backdrop" aria-hidden="true"><img src={childrenFriends} alt="" /></div>
            <p className="eyebrow">PLATEFORME DE PROTECTION DE L’ENFANCE À GOMA</p>
            <h1>Chaque signalement peut <span>protéger un enfant.</span></h1>
            <p className="hero-description">EnfanceSûre facilite le signalement confidentiel, l’orientation vers les services compétents et le suivi des actions engagées à Goma.</p>
            <div className="hero-actions">
              <a href="/signaler" className="primary-button">Déclarer une situation</a>
              <a href="/suivi" className="secondary-button">Suivre un dossier</a>
            </div>
            <div className="trust-note"><span className="shield" aria-hidden="true">✓</span><span>Les données de localisation sont réservées aux équipes habilitées. En cas de danger immédiat, contactez les services d’urgence.</span></div>
          </div>
          <div className="hero-visual"><div className="hero-photo-collage" role="group" aria-label="Photographies d’illustration"><figure className="hero-photo-cover"><img className="hero-photo-main" src={childrenGroup} alt="Des enfants souriants réunis en groupe" /><figcaption className="photo-caption">Des images d’illustration, pour rappeler l’importance de protéger chaque enfant.</figcaption><span className="photo-label">ENFANCE & PROTECTION</span></figure><div className="hero-photo-row"><img className="hero-photo-small" src={childrenPortrait} alt="Des enfants réunis en extérieur" /><img className="hero-photo-small" src={childrenFriends} alt="Un groupe d’enfants souriants en plein air" /></div></div></div>
        </section>

        <section className="stats-bar" aria-label="Services de la plateforme">
          <div><strong>Confidentiel</strong><span>Transmission protégée</span></div><div><strong>Goma</strong><span>Quartiers desservis</span></div><div><strong>Référence</strong><span>Suivi du dossier</span></div><div><strong>À tout moment</strong><span>Accès à la plateforme</span></div>
        </section>
        </>}

        {page === 'mission' && <section className="mission page-section" id="signalements">
          <p className="section-label">NOTRE MISSION</p><h2>Protéger les enfants</h2><p>Notre mission principale est de protéger les enfants en facilitant le signalement des violences, l’intervention des services compétents et le suivi des enfants victimes, tout en garantissant la confidentialité de leurs informations.</p>
          <div className="mission-grid"><article className="mission-card"><h3>Signalement confidentiel</h3><p>Un formulaire guidé pour partager uniquement les informations utiles.</p></article><article className="mission-card"><h3>Repérage local</h3><p>Les quartiers de Goma sont réservés aux équipes habilitées.</p></article><article className="mission-card"><h3>Suivi transparent</h3><p>Une référence unique permet de suivre l’avancement d’un dossier.</p></article></div>
          <div className="page-actions"><a href="/signaler" className="primary-button">Faire un signalement</a><a href="/carte" className="secondary-button">Voir la carte de Goma</a></div>
        </section>}

        {page === 'map' && <section className="map-section page-section" id="carte">
          <div className="map-copy">
            <p className="section-label">CARTE DE GOMA · NORD-KIVU</p>
            <h2>Explorer Goma et ses quartiers</h2>
            <p>Une carte réelle centrée sur Goma, avec ses routes, le lac Kivu et les quartiers présents dans OpenStreetMap. Zoomez pour examiner les quartiers indiqués sur la carte. Aucun emplacement individuel de signalement n’est affiché.</p>
            <a className="map-open-link" href="https://www.openstreetmap.org/#map=14/-1.6666/29.2257" target="_blank" rel="noreferrer">Ouvrir la carte en plein écran <span aria-hidden="true">↗</span></a>
          </div>
          <div className="map-panel">
            <div className="goma-map-frame">
              <iframe
                title="Carte OpenStreetMap de Goma et de ses quartiers"
                src="https://www.openstreetmap.org/export/embed.html?bbox=29.14%2C-1.72%2C29.25%2C-1.60&layer=mapnik"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <p className="map-attribution">Carte © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · Les limites et noms de quartiers dépendent des données cartographiques disponibles.</p>
          </div>
        </section>}

        {page === 'tracking' && <section className="tracking-section page-section" id="suivi">
          <p className="section-label">SUIVI DE PRISE EN CHARGE</p><h2>Gardez le lien avec votre signalement</h2><p>Entrez la référence reçue après l’envoi d’un signalement pour consulter son statut.</p>
          <form className="tracking-form" onSubmit={trackReport}><label htmlFor="tracking-reference">Référence du dossier</label><div><input id="tracking-reference" value={trackingReference} onChange={(event) => { setTrackingReference(event.target.value); setTrackingStatus(''); setTrackingMessage(''); }} placeholder="Ex. ES-123456" required /><button className="primary-button" type="submit">Consulter</button></div>{trackingMessage && <p className={trackingStatus ? 'form-message' : 'form-error'} role={trackingStatus ? 'status' : 'alert'}>{trackingMessage}</p>}</form>
          {trackingStatus && <div className="tracking-result" aria-live="polite"><p>État actuel du dossier</p><strong>{trackingStatus}</strong></div>}
          {trackingStatus && <div className="tracking-grid">{trackingSteps.map((step, index) => {
            const activeIndex = trackingSteps.findIndex((item) => item.status === trackingStatus);
            const isComplete = index < activeIndex || trackingStatus === 'Clôturé';
            const isCurrent = index === activeIndex;
            return <article className={`tracking-card${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`} key={step.status} aria-current={isCurrent ? 'step' : undefined}><div className={`status-tag${isComplete ? ' success' : ''}`}>{step.status}</div><h3>{step.title}</h3><p>{step.description}</p></article>;
          })}</div>}
        </section>}

        {page === 'report' && <section className="report-section page-section" id="signaler"><p className="section-label">DÉCLARER UNE SITUATION</p><h2>Transmettre une inquiétude à Goma</h2><p>Choisissez la situation observée et le quartier concerné, puis décrivez les faits avec vos mots.</p><form className="report-form" onSubmit={submitReport}><div className="form-grid"><label>Type de situation<select name="category" value={form.category} onChange={updateForm} required><option value="">Choisir une catégorie</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Quartier concerné<select name="location" value={form.location} onChange={updateForm} required><option value="">Choisir un quartier</option>{neighborhoods.map((name) => <option key={name}>{name}</option>)}</select></label></div><label>Description des faits<textarea name="details" value={form.details} onChange={updateForm} rows="5" placeholder="Que s’est-il passé ? Quand ?" required /></label><label>Contact facultatif<input name="contact" value={form.contact} onChange={updateForm} placeholder="Email ou téléphone" /></label><button className="primary-button" type="submit" disabled={reportSubmitting}>{reportSubmitting ? 'Envoi en cours…' : 'Envoyer le signalement'}</button>{reportError && <p className="form-error" role="alert">{reportError}</p>}{reference && <div className="submission-confirmation" role="status"><strong>Signalement enregistré.</strong><span>Votre référence est <b>{reference}</b>. Conserve-la pour le suivi.</span></div>}</form></section>}

        {page === 'contact' && <section className="contact-page page-section">
          <p className="section-label">CONTACT & ORIENTATION</p>
          <h1>Nous sommes là pour orienter votre démarche.</h1>
          <p className="contact-intro">EnfanceSûre facilite la transmission confidentielle et le suivi des situations de protection de l’enfance à Goma.</p>
          <div className="contact-grid">
            <article className="contact-card"><h2>Vous souhaitez signaler une situation ?</h2><p>Utilisez le formulaire dédié pour transmettre les informations utiles aux équipes habilitées.</p><a className="primary-button" href="/signaler">Accéder au signalement</a></article>
            <article className="contact-card"><h2>Vous avez déjà une référence ?</h2><p>Consultez l’étape actuelle de votre dossier à l’aide de la référence reçue.</p><a className="secondary-button" href="/suivi">Suivre un dossier</a></article>
          </div>
          <p className="contact-note">EnfanceSûre n’est pas un service d’urgence. En cas de danger immédiat, contacte directement les services d’urgence ou de protection locaux.</p>
        </section>}
      </main>

      {!isAdmin && <footer><a className="footer-logo" href="/">EnfanceSûre</a><p>Protection de l’enfance à Goma • Signalements confidentiels</p><a href="/contact">Contact</a></footer>}

      {isAdmin && <section className="admin-section" id="admin"><div className="admin-heading"><div><p className="section-label">ESPACE ADMINISTRATEUR</p><h2>Centre de pilotage</h2><p>Les signalements transmis apparaissent ici après connexion.</p></div>{adminSession && <button className="secondary-button" type="button" onClick={signOutAdmin}>Se déconnecter</button>}</div>{passwordRecovery && <form className="admin-login" onSubmit={updateAdminPassword}><h3>Nouveau mot de passe</h3><p>Choisis un nouveau mot de passe pour ton compte administrateur.</p><label>Nouveau mot de passe<input type="password" autoComplete="new-password" minLength="8" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} required /></label><button className="primary-button" type="submit" disabled={recoveryLoading || !supabase}>{recoveryLoading ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}</button>{recoveryMessage && <p className={recoveryMessage.startsWith('Mot de passe modifié') ? 'form-message' : 'form-error'} role="status">{recoveryMessage}</p>}</form>}{!passwordRecovery && adminStatus === 'signed-out' && <form className="admin-login" onSubmit={signInAdmin}><h3>Connexion administrateur</h3><label>Adresse e-mail<input type="email" autoComplete="username" value={adminCredentials.email} onChange={(event) => { setAdminCredentials((current) => ({ ...current, email: event.target.value })); setRecoveryEmailSent(false); }} required /></label><label>Mot de passe<input type="password" autoComplete="current-password" value={adminCredentials.password} onChange={(event) => setAdminCredentials((current) => ({ ...current, password: event.target.value }))} required /></label><button className="primary-button" type="submit" disabled={adminLoading || !supabase}>{adminLoading ? 'Connexion…' : 'Se connecter'}</button><button className="recovery-link" type="button" onClick={sendAdminPasswordRecovery} disabled={adminLoading || !supabase}>Mot de passe oublié ?</button>{recoveryEmailSent && <p className="form-message" role="status">Si ce compte existe, un lien de récupération a été envoyé à cette adresse. Vérifie aussi les courriers indésirables.</p>}{!supabase && <p className="form-error" role="alert">La connexion Supabase n’est pas configurée.</p>}</form>}{!passwordRecovery && adminStatus === 'checking' && <p role="status">Vérification de l’accès administrateur…</p>}{!passwordRecovery && recoveryMessage && <p className="form-message" role="status">{recoveryMessage}</p>}{adminError && <p className="form-error" role="alert">{adminError}</p>}{!passwordRecovery && adminStatus === 'authorized' && <><div className="admin-stats"><div><span>Total des signalements</span><strong>{reports.length}</strong></div><div><span>Nouveaux</span><strong>{reports.filter((record) => record.status === 'Nouveau').length}</strong></div><div><span>En évaluation</span><strong>{reports.filter((record) => record.status === 'En évaluation').length}</strong></div><div><span>Accompagnements</span><strong>{reports.filter((record) => record.status === 'Accompagnement').length}</strong></div></div><div className="admin-toolbar"><h3>Signalements reçus</h3><label htmlFor="admin-status-filter">Filtrer par statut<select id="admin-status-filter" value={adminFilter} onChange={(event) => setAdminFilter(event.target.value)}><option>Tous</option><option>Nouveau</option><option>En évaluation</option><option>Accompagnement</option><option>Clôturé</option></select></label></div>{reportError && <p className="form-error" role="alert">{reportError}</p>}{filteredRecords.length === 0 ? <p>Aucun signalement pour ce filtre.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Référence</th><th>Type</th><th>Quartier</th><th>Message</th><th>Contact</th><th>Statut</th><th>Reçu le</th></tr></thead><tbody>{filteredRecords.map((record) => <tr key={record.id}><td><strong>{record.reference}</strong></td><td>{record.category}</td><td>{record.neighborhood}</td><td className="report-details">{record.details}</td><td>{record.contact || 'Non communiqué'}</td><td><select aria-label={`Modifier le statut du dossier ${record.reference}`} value={record.status} disabled={updatingReportId === record.id} onChange={(event) => updateReportStatus(record.id, event.target.value)}><option>Nouveau</option><option>En évaluation</option><option>Accompagnement</option><option>Clôturé</option></select></td><td>{new Date(record.created_at).toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div>}</>}</section>}
    </div>
  );
}

export default App;
