ALTER TABLE `appSettings`
  ADD `stripeEnabled` tinyint(1) NOT NULL DEFAULT 0,
  ADD `stripePublishableKey` varchar(255),
  ADD `stripeSecretKeyEnc` text,
  ADD `stripeWebhookSecretEnc` text,
  ADD `sumupEnabled` tinyint(1) NOT NULL DEFAULT 0,
  ADD `sumupApiKeyEnc` text,
  ADD `paypalEnabled` tinyint(1) NOT NULL DEFAULT 0,
  ADD `paypalClientId` varchar(255),
  ADD `paypalClientSecretEnc` text,
  ADD `paypalMode` varchar(16) NOT NULL DEFAULT 'sandbox';
