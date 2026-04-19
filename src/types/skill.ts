export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  source_path: string;
  skill_type: string;
  folder_path: string;
}

export interface KitEntry {
  id: string;
  name: string;
  description: string;
  skill_ids: string[];
}
