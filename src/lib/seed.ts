import type { Host, PortForward } from "@/lib/types";

export const seedHosts: Host[] = [
  {
    id: "bastion-prod",
    name: "bastion-prod",
    user: "deploy",
    hostname: "bastion-prod",
    port: 22,
    status: "connected",
  },
  {
    id: "staging",
    name: "staging",
    user: "ubuntu",
    hostname: "staging.internal",
    port: 22,
    status: "idle",
  },
  {
    id: "jump-2",
    name: "jump-2",
    user: "ops",
    hostname: "jump-2.edge",
    port: 2222,
    status: "error",
  },
];

export const seedForwards: Record<string, PortForward[]> = {
  "bastion-prod": [
    {
      id: "fwd-1",
      type: "L",
      local: "localhost:5432",
      remote: "db:5432",
      status: "active",
    },
    {
      id: "fwd-2",
      type: "L",
      local: "localhost:6379",
      remote: "redis:6379",
      status: "idle",
    },
  ],
  staging: [],
  "jump-2": [],
};
