-- Nouvel état : la passe 2 (conformité produit) devient distinguable de la passe 1,
-- pour que l'UI puisse montrer l'avancement réel de l'analyse étape par étape.
ALTER TYPE "CoachingStatus" ADD VALUE 'CONFORMITY';
