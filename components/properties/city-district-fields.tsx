"use client";

import { useState } from "react";
import { fieldInput, fieldLabel } from "@/components/ui/styles";
import type { City, DistrictOption } from "@/lib/properties/cities";

type CityDistrictFieldsProps = {
  cities: readonly City[];
  /** Districts present in the listing data, with their city. */
  districts: readonly DistrictOption[];
  defaultCity: string;
  defaultDistrict: string;
};

/**
 * City and district selects for the filter form. The district list follows the chosen city, and
 * choosing another city clears a district that is not in it. Plain form fields: the form still
 * submits as a normal GET request, and the server validates the combination again.
 */
export function CityDistrictFields({
  cities,
  districts,
  defaultCity,
  defaultDistrict,
}: CityDistrictFieldsProps) {
  const [city, setCity] = useState(defaultCity);
  const [district, setDistrict] = useState(defaultDistrict);
  const cityName = cities.find((item) => item.slug === city)?.name;
  const options = cityName ? districts.filter((item) => item.city === cityName) : districts;

  return (
    <>
      <div>
        <label htmlFor="filter-city" className={fieldLabel}>
          ქალაქი
        </label>
        <select
          id="filter-city"
          name="city"
          value={city}
          onChange={(event) => {
            const next = event.target.value;
            const nextName = cities.find((item) => item.slug === next)?.name;
            setCity(next);
            if (
              nextName &&
              !districts.some((item) => item.city === nextName && item.name === district)
            ) {
              setDistrict("");
            }
          }}
          className={fieldInput}
        >
          <option value="">ყველა</option>
          {cities.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="filter-district" className={fieldLabel}>
          უბანი
        </label>
        <select
          id="filter-district"
          name="district"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          className={fieldInput}
        >
          <option value="">{cityName ? `ყველა (${cityName})` : "ნებისმიერი"}</option>
          {options.map((item) => (
            <option key={`${item.city}-${item.name}`} value={item.name}>
              {cityName ? item.name : `${item.name} (${item.city})`}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
