SYNTHETIC TEST DATA. Nothing in this folder is real source data.

fred/            FRED-shaped observation responses. Anchor observations equal the values already
                 published in data/editions/2026-11.json (so the acceptance test can show the fetcher
                 reproduces them); every other observation is made-up filler.
eurostat/        Eurostat JSON-stat 2.0 response shape for dataset une_rt_m, made-up values.
apartmentlist/   Apartment List rent-estimates CSV layout, made-up values chosen to match the
                 November 2026 edition's metro rents and y/y changes.

Never copy these values into data/editions/, data/history/ or data/config/.
