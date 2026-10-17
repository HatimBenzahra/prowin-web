-- Le nom commercial d'une tablette provient desormais du heartbeat
-- (device.commercialName, backend kiosk). La table de mapping manuel
-- n'est plus utilisee par l'application.

-- DropTable
-- IF EXISTS : la table avait ete creee hors migrations (absente de 0_baseline).
-- Sans lui, une base neuve (tests d'integration, reconstruction) bloque ici.
DROP TABLE IF EXISTS "DeviceMapping";
