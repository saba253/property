-- 0001 - Initial schema for properties, listings, characteristics and listing images.
--
-- Mirrors the domain model in lib/properties/types.ts. Limits mirror the TypeScript record
-- validation (lib/properties/validate-record.ts), which reuses the listing form's limits
-- (DETAIL_FIELDS, PRICE_LIMITS, MAX_DISTRICT_LENGTH, MAX_TITLE_LENGTH in lib/listing-draft/draft.ts).
-- Change both together. Money and area use exact NUMERIC with at most 2 decimals (coordinates 6):
-- values with more decimals are REJECTED (CHECK scale(...)), never silently rounded as NUMERIC(p,s)
-- would. Conversion to JavaScript numbers happens only in lib/db/mappers.ts. Nothing here deletes data.

-- Cities that can be used in URL filters (lib/properties/cities.ts: knownCities). Reference data,
-- not demo data. Districts stay free text from listing data: there is no district directory.
CREATE TABLE cities (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 50)
);

INSERT INTO cities (slug, name) VALUES ('tbilisi', 'თბილისი'), ('batumi', 'ბათუმი');

-- The physical asset. Apartment-only and house-only facts are NULL for the other type; NULL means
-- "not stated" (unknown), never zero.
CREATE TABLE properties (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  type text NOT NULL CHECK (type IN ('apartment', 'house')),
  city_slug text NOT NULL REFERENCES cities (slug),
  district text NOT NULL CHECK (district = btrim(district) AND length(district) BETWEEN 1 AND 50),
  area_sqm numeric NOT NULL CHECK (area_sqm BETWEEN 5 AND 10000 AND scale(area_sqm) <= 2),
  rooms smallint CHECK (rooms BETWEEN 1 AND 30),
  bedrooms smallint CHECK (bedrooms BETWEEN 0 AND 30),
  bathrooms smallint CHECK (bathrooms BETWEEN 0 AND 20),
  floor smallint CHECK (floor BETWEEN -3 AND 150),
  total_floors smallint CHECK (total_floors BETWEEN 1 AND 150),
  storeys smallint CHECK (storeys BETWEEN 1 AND 10),
  land_area_sqm numeric CHECK (land_area_sqm BETWEEN 1 AND 1000000 AND scale(land_area_sqm) <= 2),
  -- Map location and how precisely it is known (lib/geo/location.ts).
  location_precision text NOT NULL DEFAULT 'unknown'
    CHECK (location_precision IN ('exact', 'approximate', 'unknown')),
  location_area_id text CHECK (location_area_id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  latitude numeric CHECK (latitude BETWEEN -90 AND 90 AND scale(latitude) <= 6),
  longitude numeric CHECK (longitude BETWEEN -180 AND 180 AND scale(longitude) <= 6),
  location_verified_on date,
  -- Only "demo" exists today; real data will be a deliberate later migration.
  data_source text NOT NULL CHECK (data_source IN ('demo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Target for listings' composite foreign key (a listing's data source equals its property's).
  UNIQUE (id, data_source),
  CONSTRAINT bedrooms_not_above_rooms CHECK (bedrooms IS NULL OR rooms IS NULL OR bedrooms <= rooms),
  CONSTRAINT apartment_only_facts CHECK (type = 'apartment' OR (floor IS NULL AND total_floors IS NULL)),
  CONSTRAINT house_only_facts CHECK (type = 'house' OR (storeys IS NULL AND land_area_sqm IS NULL)),
  CONSTRAINT floor_within_building CHECK (floor IS NULL OR total_floors IS NULL OR floor <= total_floors),
  -- Exact coordinates only with a verification date; an approximate location names an area.
  CONSTRAINT location_consistent CHECK (
    (location_precision = 'exact' AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND location_verified_on IS NOT NULL AND location_area_id IS NULL)
    OR (location_precision = 'approximate' AND location_area_id IS NOT NULL
      AND latitude IS NULL AND longitude IS NULL AND location_verified_on IS NULL)
    OR (location_precision = 'unknown' AND location_area_id IS NULL
      AND latitude IS NULL AND longitude IS NULL AND location_verified_on IS NULL)
  )
);

-- The offer to sell or rent a property. The asking price is stored exactly as advertised (amount
-- and currency); conversions are calculated at read time and never stored.
CREATE TABLE listings (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  -- Insertion order: the stable "default" order and tie-breaker for every sort.
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  property_id text NOT NULL,
  title text NOT NULL CHECK (title = btrim(title) AND length(title) BETWEEN 1 AND 80),
  transaction_type text NOT NULL CHECK (transaction_type IN ('sale', 'rent')),
  rent_period text CHECK (rent_period IN ('month')),
  asking_amount numeric NOT NULL CHECK (scale(asking_amount) <= 2),
  asking_currency text NOT NULL CHECK (asking_currency IN ('USD', 'GEL')),
  -- Lifecycle today: active or inactive. Moderation states (draft, pending review, rejected,
  -- archived) are a later migration together with the code that uses them.
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  data_source text NOT NULL CHECK (data_source IN ('demo')),
  -- Only when actually known; demo listings have none.
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, data_source) REFERENCES properties (id, data_source),
  CONSTRAINT rent_has_period CHECK (
    (transaction_type = 'rent' AND rent_period IS NOT NULL)
    OR (transaction_type = 'sale' AND rent_period IS NULL)
  ),
  -- Same limits as the listing form (PRICE_LIMITS): sale price, or monthly rent.
  CONSTRAINT asking_amount_in_range CHECK (
    (transaction_type = 'sale' AND asking_amount BETWEEN 1000 AND 100000000)
    OR (transaction_type = 'rent' AND asking_amount BETWEEN 10 AND 100000)
  )
);

-- Characteristics with three states. A missing row means "unknown" as well; an explicit
-- 'unknown' row is kept when the source said so. Keys mirror lib/properties/amenities.ts
-- (the removed "bed" item is intentionally absent; bedrooms is a number on properties).
CREATE TABLE property_features (
  property_id text NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  feature_key text NOT NULL CHECK (feature_key IN ('balcony', 'parking', 'garage', 'elevator',
    'centralHeating', 'naturalGas', 'basement', 'storageRoom', 'builtInKitchen')),
  status text NOT NULL CHECK (status IN ('yes', 'no', 'unknown')),
  PRIMARY KEY (property_id, feature_key)
);

CREATE TABLE listing_equipment (
  listing_id text NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  equipment_key text NOT NULL CHECK (equipment_key IN ('furniture', 'television', 'refrigerator',
    'washingMachine', 'airConditioning', 'dishwasher')),
  status text NOT NULL CHECK (status IN ('yes', 'no', 'unknown')),
  PRIMARY KEY (listing_id, equipment_key)
);

-- Images belong to the listing (lib/properties/types.ts: ListingImage). No uploads yet: an
-- illustration names a scene; a photo has a path or URL.
CREATE TABLE listing_images (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  listing_id text NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  is_cover boolean NOT NULL DEFAULT false,
  alt text NOT NULL CHECK (length(btrim(alt)) BETWEEN 1 AND 300),
  caption text CHECK (length(caption) <= 200),
  source_kind text NOT NULL CHECK (source_kind IN ('illustration', 'photo')),
  scene text CHECK (scene IN ('building-exterior', 'house-exterior', 'living-room', 'kitchen',
    'bedroom', 'bathroom', 'balcony-view', 'yard')),
  src text CHECK (length(src) BETWEEN 1 AND 2000),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  UNIQUE (listing_id, sort_order),
  CONSTRAINT image_source_consistent CHECK (
    (source_kind = 'illustration' AND scene IS NOT NULL AND src IS NULL
      AND width IS NULL AND height IS NULL)
    OR (source_kind = 'photo' AND src IS NOT NULL AND scene IS NULL)
  )
);

-- At most one explicit cover per listing (without one, the first image by order is the cover).
CREATE UNIQUE INDEX listing_images_one_cover ON listing_images (listing_id) WHERE is_cover;

-- Indexes for the queries in lib/db/postgres-repository.ts (see db/README.md for the reasoning).
-- Search: active listings of one transaction type in default order (every /properties request).
CREATE INDEX listings_active_by_transaction ON listings (transaction_type, seq)
  WHERE status = 'active';
-- Joins from listings to properties, and comparables (other offers of the same property).
CREATE INDEX listings_property_id ON listings (property_id);
-- Search by city/district and comparables: same city and type, area range.
CREATE INDEX properties_city_district ON properties (city_slug, district);
CREATE INDEX properties_city_type_area ON properties (city_slug, type, area_sqm);
-- Amenity filters look up "yes" rows by key.
CREATE INDEX property_features_yes ON property_features (feature_key, property_id)
  WHERE status = 'yes';
CREATE INDEX listing_equipment_yes ON listing_equipment (equipment_key, listing_id)
  WHERE status = 'yes';
