const puppeteer = require("puppeteer");

const startScraping = async () => {
  console.log("start launching ");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.oncokb.org/actionableGenes#sections=Tx");
  await new Promise((r) => setTimeout(r, 2500));

  // find result number
  const result_num = await page.$eval(".container-fluid b", (div) => {
    return div.innerText;
  });
  const numberMatch = result_num.match(/\d+/);
  if (numberMatch) {
    const number = numberMatch[0];
    console.log("the rows result is", number);
  } else {
    console.log("No number found in the result.");
    await browser.close();
  }

  // wait for loading data
  await page.waitForSelector(
    `div:nth-of-type(${numberMatch[0]}) > div[role=\'row\']`
  );

  //extract data into json
  let divElements = await page.$$eval(".rt-tbody [role='rowgroup']", (divs) => {
    let tableData = [];

    // iteration each row
    for (const div of divs) {
      const linkTags = div.querySelectorAll("a"); // Find all <a> elements within the div
      const divData = div.innerText.split("\n");
      const URLs = [];

      // iteration urls
      linkTags.forEach((linkTag) => {
        const href = encodeURI(linkTag.getAttribute("href"));
        if (href) {
          const formattedHref = "https://www.oncokb.org" + href;
          URLs.push(formattedHref);
        }
      });

      //create data object
      tableData.push({
        Gene: divData[0],
        Alterations: divData[1],
        URLs: {
          GeneURL: URLs.slice(0, 1),
          AlterationsURL: URLs.slice(1),
        },
      });
    }

    // Deleting duplicate pairs of genes and changes to avoid unnecessary iteration
    return tableData.filter((dictionary, index, self) => {
      // Check if the current dictionary appears later in the list
      return (
        self.findIndex(
          (other) => JSON.stringify(other) === JSON.stringify(dictionary)
        ) === index
      );
    });
  });

  // Uncomment the following line if you want to limit the number of elements processed.
  // divElements = divElements.slice(0, 15);

  const dateStart = Date.now();
  console.log("start");

  for (let div of divElements) {
    let combinedJSON = {
      geneData: [],
      variantData: [],
    };

    for (let i = 0; i < div.URLs.AlterationsURL.length; i++) {
      let alterationURL = div.URLs.AlterationsURL[i];
      let gene = div.Gene;
      let variant =
        div.Alterations.indexOf("(excluding") > 0
          ? div.Alterations
          : div.Alterations.split(",")[i].trim();

      if (variant.startsWith("Exon") || variant.includes("other")) {
        continue;
      }
      if (variant.includes("(") && !variant.includes("excluding")) {
        variant = variant.replace(/\([^)]*\)/g, "").trim();
      }

      // Navigate to each Alterations URL
      const [geneRes, variantRes] = await Promise.all([
        page.waitForResponse(
          `https://www.oncokb.org/api/private/utils/numbers/gene/${encodeURIComponent(
            gene
          )}`
        ),
        page.waitForResponse(
          `https://www.oncokb.org/api/v1/variants/lookup?hugoSymbol=${encodeURIComponent(
            gene
          )}&variant=${encodeURIComponent(variant)}`
        ),
        page.goto(alterationURL, { waitUntil: "domcontentloaded" }),
      ]);

      // create a combined JSON
      combinedJSON.geneData = await geneRes.json();
      combinedJSON.variantData.push(await variantRes.json());
      div["Data"] = combinedJSON;
    }
  }

  const dateEnd = Date.now();
  console.log((dateEnd - dateStart) / 1000);

  //print results and status results
  console.log(" num scrapped results ", divElements.length);
  console.log(divElements);
  await browser.close();
};

startScraping();
