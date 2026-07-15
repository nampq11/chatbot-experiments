CREATE TABLE IF NOT EXISTS `session_data` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `parent_id` varchar(36) NULL,
  `sequence` int NOT NULL,
  `type` enum('message','model_change','thinking_level_change','active_tools_change','compaction','branch_summary','custom','custom_message','leaf') NOT NULL,
  `payload` json NOT NULL,
  `schema_version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_data_session_sequence_index` (`session_id`, `sequence`),
  KEY `session_data_session_index` (`session_id`),
  KEY `session_data_parent_index` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
