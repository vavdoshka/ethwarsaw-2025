/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("accounts", (table) => {
    table.text("address").primary();
    table.text("balance").notNullable();
    table.integer("nonce").notNullable();
  });

  await knex.schema.createTable("blocks", (table) => {
    table.integer("block_number").primary();
    table.text("block_hash").notNullable().unique();
    table.text("parent_hash");
    table.text("created_at").notNullable();
  });

  await knex.schema.createTable("transactions", (table) => {
    table.text("tx_hash").primary();
    table.integer("block_number").notNullable().references("block_number").inTable("blocks");
    table.integer("tx_index").notNullable();
    table.text("from_address").notNullable();
    table.text("to_address").notNullable();
    table.text("value").notNullable();
    table.integer("nonce").notNullable();
    table.text("status").notNullable();
    table.text("created_at").notNullable();
    table.unique(["block_number", "tx_index"]);
  });

  await knex.schema.createTable("receipts", (table) => {
    table.text("tx_hash").primary().references("tx_hash").inTable("transactions");
    table.integer("block_number").notNullable();
    table.integer("tx_index").notNullable();
    table.text("status").notNullable();
    table.text("gas_used").notNullable();
  });

  await knex.schema.createTable("sync_jobs", (table) => {
    table.text("tx_hash").primary();
    table.integer("block_number").notNullable();
    table.text("status").notNullable();
    table.integer("retry_count").notNullable().defaultTo(0);
    table.text("last_error");
    table.text("next_retry_at");
    table.text("export_batch_id");
    table.text("synced_at");
    table.text("updated_at").notNullable();
  });

  await knex.schema.createTable("journal_events", (table) => {
    table.increments("id").primary();
    table.text("tx_hash");
    table.text("event_type").notNullable();
    table.text("payload").notNullable();
    table.text("created_at").notNullable();
  });

  await knex.schema.createTable("system_contract_state", (table) => {
    table.text("contract_address").notNullable();
    table.text("state_key").notNullable();
    table.text("state_value").notNullable();
    table.text("updated_at").notNullable();
    table.primary(["contract_address", "state_key"]);
  });

  await knex.schema.createTable("sync_checkpoints", (table) => {
    table.integer("id").primary();
    table.integer("last_synced_block").notNullable().defaultTo(0);
    table.integer("last_exported_block").notNullable().defaultTo(0);
    table.text("updated_at").notNullable();
  });

  await knex("sync_checkpoints").insert({
    id: 1,
    last_synced_block: 0,
    last_exported_block: 0,
    updated_at: knex.fn.now()
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("sync_checkpoints");
  await knex.schema.dropTableIfExists("system_contract_state");
  await knex.schema.dropTableIfExists("journal_events");
  await knex.schema.dropTableIfExists("sync_jobs");
  await knex.schema.dropTableIfExists("receipts");
  await knex.schema.dropTableIfExists("transactions");
  await knex.schema.dropTableIfExists("blocks");
  await knex.schema.dropTableIfExists("accounts");
};
