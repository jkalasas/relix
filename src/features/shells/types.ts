export type ShellSession = {
  id: string;
  hostId: string;
  title: string;
  customTitle?: string;
  cwd?: string;
  channelId?: string;
  tmuxWindowId?: string;
  tmuxSession?: string;
};
