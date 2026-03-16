export type Message = {
  id: string;
  from: string;
  text: string;
  at: string;
};

export type DMConversation = {
  id: string;
  handle: string;
  name: string;
  online: boolean;
  lastMessage: string;
  lastAt: string;
  unread: number;
  messages: Message[];
  verified?: boolean;
};

export type GroupConversation = {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string;
  lastAt: string;
  unread: number;
  messages: Message[];
};

export const SAMPLE_DMS: DMConversation[] = [];
export const SAMPLE_GROUPS: GroupConversation[] = [];
