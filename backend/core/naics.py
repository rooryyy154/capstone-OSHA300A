"""NAICS normalization (decision D-006).

Plants report codes from the 2012, 2017 or 2022 NAICS editions, and `naics_year` can't be
trusted to say which. The 2022 revision rebuilt retail trade (sectors 44-45), so the same
store type ends up split across old and new codes. This crosswalk moves the retail codes
that were renamed or merged onto their 2022 code, following the Census Bureau's 2017->2022
concordance (and 2012->2017 for codes that changed twice).

Not mapped, on purpose:
- 454110 / 454111-454113 (electronic shopping) and 454390 (direct selling): 2022 split them
  across many store-type industries, so there is no single target code.
- Changes outside retail: fewer rows, documented as a limitation in docs/decisions.md.
"""

RETAIL_TO_2022 = {
    # 441 Motor vehicle and parts dealers
    '441228': '441227',  # Motorcycle, ATV, and all other motor vehicle dealers
    '441310': '441330',  # Automotive parts and accessories
    '441320': '441340',  # Tire dealers
    # 442 Furniture and home furnishings -> 449
    '442110': '449110',
    '442210': '449121',
    '442291': '449122',
    '442299': '449129',
    # 443 Electronics and appliances -> 449
    '443141': '449210',
    '443142': '449210',
    # 444 Building material and garden
    '444130': '444140',  # Hardware
    '444190': '444180',  # Other building material dealers
    '444210': '444230',  # Outdoor power equipment
    '444220': '444240',  # Nursery, garden center, and farm supply
    # 445 Food and beverage
    '445120': '445131',  # Convenience
    '445210': '445240',  # Meat
    '445220': '445250',  # Fish and seafood
    '445299': '445298',  # All other specialty food
    '445310': '445320',  # Beer, wine, and liquor
    # 446 Health and personal care -> 456
    '446110': '456110',
    '446120': '456120',
    '446130': '456130',
    '446191': '456191',
    '446199': '456199',
    # 447 Gasoline stations -> 457
    '447110': '457110',
    '447190': '457120',
    # 448 Clothing and accessories -> 458 (2022 merged all clothing stores into 458110)
    '448110': '458110',
    '448120': '458110',
    '448130': '458110',
    '448140': '458110',
    '448150': '458110',
    '448190': '458110',
    '448210': '458210',
    '448310': '458310',
    '448320': '458320',
    # 451 Sporting goods, hobby, musical instrument, and book -> 459
    '451110': '459110',
    '451120': '459120',
    '451130': '459130',
    '451140': '459140',
    '451211': '459210',
    '451212': '459210',
    # 452 General merchandise -> 455 (2012 codes 4521xx/4529xx included)
    '452111': '455110',
    '452112': '455110',
    '452210': '455110',
    '452311': '455211',
    '452910': '455211',
    '452319': '455219',
    '452990': '455219',
    # 453 Miscellaneous store retailers -> 459
    '453110': '459310',
    '453210': '459410',
    '453220': '459420',
    '453310': '459510',
    '453910': '459910',
    '453920': '459920',
    '453930': '459930',
    '453991': '459991',
    '453998': '459999',
    # 454 Nonstore retailers with a single 2022 target
    '454210': '445132',  # Vending machine operators
    '454310': '457210',  # Fuel dealers
    '454311': '457210',
    '454312': '457210',
    '454319': '457210',
}


# The 2-digit sectors that exist in NAICS 2012-2022
SECTORS = {
    '11', '21', '22', '23', '31', '32', '33', '42', '44', '45', '48', '49',
    '51', '52', '53', '54', '55', '56', '61', '62', '71', '72', '81', '92',
}


def is_valid_naics(code):
    """Structural check (D-008): 6 digits, a real sector, and a real 5-digit industry.

    Industry digits (the 5th) run 1-9, so codes like 332700 are a subsector padded with zeros,
    not a real industry. OSHA doesn't validate the codes plants type in.
    """
    return len(code) == 6 and code.isdigit() and code[:2] in SECTORS and code[4] != '0'


def normalize_naics(code):
    """Return the 2022 code for a reported NAICS code (unchanged when no mapping applies)."""
    return RETAIL_TO_2022.get(code, code)
