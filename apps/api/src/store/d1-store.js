import { MemoryStore } from './memory-store.js';
import { createInitialState, normalizeState } from './utils.js';

export class D1Store extends MemoryStore {
  constructor(binding) {
    super(createInitialState());
    this.kind = 'd1';
    this.binding = binding;
    this.ready = this.load();
  }

  async info() {
    return { kind: this.kind };
  }

  async bootstrap() {
    await this.ready;
    return super.bootstrap();
  }

  async persist() {
    await this.ready;
    await this.binding.prepare(`
      insert into app_state (key, value, updated_at)
      values ('state', ?, current_timestamp)
      on conflict(key) do update set
        value = excluded.value,
        updated_at = excluded.updated_at
    `).bind(JSON.stringify(this.state)).run();
  }

  async load() {
    await this.binding.prepare(`
      create table if not exists app_state (
        key text primary key,
        value text not null,
        updated_at text not null default current_timestamp
      )
    `).run();

    const row = await this.binding.prepare(`select value from app_state where key = 'state'`).first();
    this.state = row?.value ? normalizeState(JSON.parse(row.value)) : createInitialState();
    if (!row?.value) {
      await this.binding.prepare(`
        insert into app_state (key, value, updated_at)
        values ('state', ?, current_timestamp)
      `).bind(JSON.stringify(this.state)).run();
    }
  }
}
