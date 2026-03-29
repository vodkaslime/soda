export interface AgentConfigFile {
  path: string;
  exists: boolean;
}

export interface AgentDetailData {
  name: string;
  label: string;
  description: string;
  skills_label: string;
  installed: boolean;
  binary_path: string | null;
  version: string | null;
  provider: string | null;
  model: string | null;
  config_files: AgentConfigFile[];
  skills: string[];
  mcp_servers: string[];
  raw_config: string | null;
}

export interface AgentStatus {
  name: string;
  label: string;
  installed: boolean;
  path: string | null;
}
