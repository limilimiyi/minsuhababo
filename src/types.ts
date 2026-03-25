export type NodeType = 'dialogue' | 'question' | 'choice';

export interface DialogueNodeData {
  id: string;
  parent_id: string | null; // snake_case로 변경
  type: NodeType;
  character_name: string;   // snake_case로 변경
  is_reviewed: boolean;     // snake_case로 변경
  condition: string;
  scene_name?: string;      // 장면 이름 필드 추가
  translations: {
    kr: string;
    en: string;
    jp: string;
  };
}
