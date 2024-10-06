const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const config = require('config');

/**
 * typedef {Object} CityInfo
 * @property {number} id_offices
 * @property {string} offices_name
 * @property {string} offices_addr
 * @property {string} lang
 * @property {string} long
 * @property {number} cnt
 * @property {number} icnt
 * @property {number} sts
 */

/**
 * @param {string} date
 * @returns {Promise<axios.AxiosResponse<CityInfo[]>>}
 */
const getCityInfo = async (date) => {
    const agent = new https.Agent({
        rejectUnauthorized: false,
    });

    const response = await axios.get(`https://eq.hsc.gov.ua/site/stepmap?chdate=${date}&question_id=55`, {
        headers: {
            "accept": "*/*",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            "priority": "u=1, i",
            "sec-ch-ua": "\"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-csrf-token": "b_-lxKi90ore791jiHH07P_E-Tt4fU-njnxPtdxBVdgurNz0-tmk7JeZkCbhQ4TUp_OAVykVHs3rJBfxqy8ngA==",
            "x-requested-with": "XMLHttpRequest",
            "cookie": config.get('hscSiteCookie'),
            "Referer": "https://eq.hsc.gov.ua/site/step2?chdate=2024-10-09&question_id=55&id_es=",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        httpsAgent: agent,
        validateStatus: function (status) {
            return status === 200 || status === 302;
        }
    });

    return response;
}

const sendTelegramMessage = async (message) => {
    const encodedMessage = encodeURIComponent(message);
    const url = `https://api.telegram.org/bot${config.get('telegramBotToken')}/sendMessage?chat_id=${config.get('telegramChatId')}&text=${encodedMessage}`;

    await axios.get(url)
        .catch(error => {
            console.error('Error occurred while sending message to telegram', error);
        });
}

const neededCityIds = [64];

(async () => {
    try {
        let shouldContinue = true;

        while (shouldContinue) {
            for (let i = 0; i < 10; i++) {
                const dateToRequets = moment.utc('2024-10-10').add(i, 'days').format('YYYY-MM-DD');

                const requestResult = await getCityInfo(dateToRequets)
                    .then(response => {
                        return {
                            status: 'ok',
                            response
                        }
                    })
                    .catch(error => {
                        return {
                            status: 'error',
                            error
                        }
                    });

                console.log(`Request for ${dateToRequets}. Status: ${requestResult.status}`);

                if (requestResult.status === 'error') {
                    throw new Error(`Error occurred: ${requestResult.error.message}`);
                } else {
                    const data = requestResult.response.data;

                    for (const id of neededCityIds) {
                        const cityData = data.find(x => x.id_offices === id);

                        if (!cityData) {
                            fs.writeFileSync(path.join(__dirname, 'data_error.json'), JSON.stringify(data, null, 2));

                            throw new Error(`City with id ${id.id} not found`);
                        }

                        if (cityData.sts === 3) {
                            await sendTelegramMessage(`${cityData.offices_addr} ${cityData.offices_name} has available slots on ${dateToRequets}`);
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (error) {
        await sendTelegramMessage(`Error occurred: ${error.message}`);

        process.exit(1);
    }
})()
