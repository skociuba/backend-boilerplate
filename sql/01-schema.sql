-- NIEUŻYWANE: schemat od teraz utrzymują migracje w migrations/ (npm run
-- migrate:up). Ten plik zostaje tylko jako historyczny zapis punktu startowego
-- i nie jest już montowany w docker-compose.yml.
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL
);