# EnfanceSûre

## Configurer Supabase

1. Dans le tableau de bord Supabase, ouvrez le SQL Editor et exécutez [`supabase/schema.sql`](supabase/schema.sql). Après toute mise à jour de ce fichier, réexécutez-le : les politiques sont réappliquées de façon idempotente.
2. Créez un utilisateur administrateur dans **Authentication → Users** et désactivez l’inscription publique.
3. Copiez son UUID et ajoutez-le à la liste des administrateurs :

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID-DE-L-UTILISATEUR');
   ```

4. Configurez `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans `.env`, puis redémarrez Vite.
5. Connectez-vous sur `/admin`. Seuls les comptes inscrits dans `admin_users` peuvent lire les détails et modifier le statut des signalements.

Les visiteurs peuvent consulter le statut et l’étape de suivi d’un dossier avec sa référence. La fonction `track_report` expose uniquement le statut, sans description ni contact. Chaque référence est générée avec un UUID aléatoire.

La clé `service_role` ne doit jamais être ajoutée à `.env` du frontend. Les politiques RLS autorisent l’envoi public d’un signalement, réservent la lecture et la modification du statut aux administrateurs et limitent le suivi public au statut.

## Déployer sur Vercel

1. Importez le dossier `signalement-enfants` comme projet Vercel (framework Vite, commande `npm run build`, dossier de sortie `dist`). Le fichier [`vercel.json`](vercel.json) configure aussi le repli SPA nécessaire à la route `/admin`.
2. Dans **Settings → Environment Variables**, ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` pour l’environnement Production. Utilisez les valeurs du `.env` local sans publier ce fichier.
3. Après le premier déploiement, notez le domaine Vercel. Dans Supabase, ouvrez **Authentication → URL Configuration**, définissez le domaine Vercel comme **Site URL** et ajoutez `https://VOTRE-DOMAINE-VERCEL/admin` aux **Redirect URLs**.
4. Redéployez après avoir enregistré les variables et les URL. Vérifiez `/admin`, le parcours de récupération du mot de passe et un signalement de test.
