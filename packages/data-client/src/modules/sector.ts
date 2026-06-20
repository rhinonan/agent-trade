import type { SectorListResponse, SectorConstituentsResponse } from "../types.js";
import type { FetchFn } from "./kline.js";

export class SectorModule {
  constructor(private fetch: FetchFn) {}

  async list(): Promise<SectorListResponse> {
    const res = await this.fetch("/sector/list");
    return res.json() as Promise<SectorListResponse>;
  }

  async constituents(name: string): Promise<SectorConstituentsResponse> {
    const res = await this.fetch(`/sector/${encodeURIComponent(name)}/constituents`);
    return res.json() as Promise<SectorConstituentsResponse>;
  }
}
