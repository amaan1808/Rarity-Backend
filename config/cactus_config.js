const config = {
  app_name: "Cactus",
  app_description:
    "Cactus is an open source package for easy rarity score calculation with ERC721 NFT metadata collection.",
  collection_file_name: "cactus.json",
  collection_contract_address: "0x5537d90a4a2dc9d9b37bab49b490cf67d4c54e91",
  collection_name: "Cactus",
  collection_description:
    "Cactus a homage to the one and only CryptoPunks. Holding a OneDayPunk will give you early access to PunkScapes and reserve a profile on the PunkScape website.",
  collection_id_from: 0,
  ignore_traits: ["date"],
  sqlite_file_name: "cactus.sqlite",
  ga: "G-BW69Z04YTP",
  main_og_image: "https://onedaypunk-rarity-tool.herokuapp.com/images/og.png",
  item_path_name: "punk",
  page_item_num: 60,
  content_image_is_video: false,
  content_image_frame: "circle", // circle, rectangle
  use_wallet: false,
};

module.exports = config;
