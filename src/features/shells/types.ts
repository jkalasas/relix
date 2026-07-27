export type ShellSession = {
  id: string;
  hostId: string;
  title: string;
  cwd?: string;
  channelId?: string;
  tmuxWindowId?: string;
  tmuxSession?: string;
};
