CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `display_name` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_index` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
  `message_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sessions_user_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `messages` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `sequence` int NOT NULL,
  `role` enum('user','assistant','system') NOT NULL,
  `content` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `messages_session_sequence_index` (`session_id`, `sequence`),
  KEY `messages_session_index` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_runs` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `message_id` varchar(36) NOT NULL,
  `status` enum('queued','running','completed','cancelled','failed') NOT NULL DEFAULT 'queued',
  `model` varchar(255) NULL,
  `output` json NULL,
  `error_message` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL,
  `cancelled_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_runs_message_index` (`message_id`),
  KEY `agent_runs_session_index` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;