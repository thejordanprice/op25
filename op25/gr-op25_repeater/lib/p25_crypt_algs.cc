/* -*- c++ -*- */
/* 
 * Copyright 2022 Graham J. Norbury
 * 
 * This is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3, or (at your option)
 * any later version.
 * 
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this software; see the file COPYING.  If not, write to
 * the Free Software Foundation, Inc., 51 Franklin Street,
 * Boston, MA 02110-1301, USA.
 */

#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include <vector>
#include <string>

/* DES */
#include <bitset>
#include <unordered_map>
#include <sstream>
#include <iomanip>

#include "p25_crypt_algs.h"
#include "op25_msg_types.h"
#include "DES.h"
#include "DES.cc"

// constructor
p25_crypt_algs::p25_crypt_algs(log_ts& logger, int debug, int msgq_id) :
    logts(logger),
    d_debug(debug),
    d_msgq_id(msgq_id),
    d_pr_type(PT_UNK),
    d_algid(0x80),
    d_keyid(0),
    d_mi{0},
    d_key_iter(d_keys.end()),
    d_adp_position(0),
    d_des_position(0) {
}

// destructor
p25_crypt_algs::~p25_crypt_algs() {
}

// remove all stored keys
void p25_crypt_algs::reset(void) {
    d_keys.clear();
}

// add or update a key
void p25_crypt_algs::key(uint16_t keyid, uint8_t algid, const std::vector<uint8_t> &key) {
    if ((keyid == 0) || (algid == 0x80))
        return;

    d_keys[keyid] = key_info(algid, key);
}

// generic entry point to prepare for decryption
bool p25_crypt_algs::prepare(uint8_t algid, uint16_t keyid, protocol_type pr_type, uint8_t *MI) {
    bool rc = false;
    d_algid = algid;
    d_keyid = keyid;
    memcpy(d_mi, MI, sizeof(d_mi));

    d_key_iter = d_keys.find(keyid);
    if (d_key_iter == d_keys.end()) {
        if (d_debug >= 10) {
            fprintf(stderr, "%s p25_crypt_algs::prepare: keyid[0x%x] not found\n", logts.get(d_msgq_id), keyid);
        }
        return rc;
    }
    if (d_debug >= 10) {
        fprintf(stderr, "%s p25_crypt_algs::prepare: keyid[0x%x] found\n", logts.get(d_msgq_id), keyid);
    }

    switch (algid) {
        case 0xaa: // ADP RC4
            d_adp_position = 0;
            d_pr_type = pr_type;
            adp_keystream_gen();
            rc = true;
            break;
        case 0x81: // DES-OFB
            d_des_position = 0;
            d_pr_type = pr_type;
            des_keystream_gen();
            rc = true;
            break;
    
        default:
            break;
    }
    return rc;
}

// generic entry point to perform decryption
bool p25_crypt_algs::process(packed_codeword& PCW, frame_type fr_type, int voice_subframe) {
    bool rc = false;

    if (d_key_iter == d_keys.end())
        return false;

    switch (d_algid) {
        case 0xaa: // ADP RC4
            rc = adp_process(PCW, fr_type, voice_subframe);
            break;
        case 0x81: //DES-OFB
            rc = des_ofb_process(PCW, fr_type, voice_subframe);
            break;
    
        default:
            break;
    }

    return rc;
}

// ADP RC4 decryption
bool p25_crypt_algs::adp_process(packed_codeword& PCW, frame_type fr_type, int voice_subframe) {
    bool rc = true;
    size_t offset = 256;

    if (d_key_iter == d_keys.end())
        return false;

    switch (fr_type) {
        case FT_LDU1:
            offset = 0;
            break;
        case FT_LDU2:
            offset = 101;
            break;
        case FT_4V_0:
            offset += 7 * voice_subframe;
            break;
        case FT_4V_1:
            offset += 7 * (voice_subframe + 4);
            break;
        case FT_4V_2:
            offset += 7 * (voice_subframe + 8);
            break;
        case FT_4V_3:
            offset += 7 * (voice_subframe + 12);
            break;
        case FT_2V:
            offset += 7 * (voice_subframe + 16);
            break;
        default:
            rc = false;
            break;
    }
    if (d_pr_type == PT_P25_PHASE1) {
        //FDMA
        offset += (d_adp_position * 11) + 267 + ((d_adp_position < 8) ? 0 : 2); // voice only; skip LCW and LSD
        d_adp_position = (d_adp_position + 1) % 9;
        for (int j = 0; j < 11; ++j) {
            PCW[j] = adp_keystream[j + offset] ^ PCW[j];
        }
    } else if (d_pr_type == PT_P25_PHASE2) {
        //TDMA
        for (int j = 0; j < 7; ++j) {
            PCW[j] = adp_keystream[j + offset] ^ PCW[j];
        }
        PCW[6] &= 0x80; // mask everything except the MSB of the final codeword
    }

    return rc;
}

bool p25_crypt_algs::des_ofb_process(packed_codeword& PCW, frame_type fr_type, int voice_subframe) {
    bool rc = true;
    size_t offset = 8; //initial offset is 8 (DES-OFB discard round)
    
    switch (fr_type) {
		/* FDMA */
        case FT_LDU1:
            offset += 0; //additional offset for FDMA is handled below
            break;
        case FT_LDU2:
            offset += 101; //additional offset for FDMA is handled below
            break;
        /* TDMA */
        case FT_4V_0:
            offset += 7 * voice_subframe;
            break;
        case FT_4V_1:
            offset += 7 * (voice_subframe + 4);
            break;
        case FT_4V_2:
            offset += 7 * (voice_subframe + 8);
            break;
        case FT_4V_3:
            offset += 7 * (voice_subframe + 12);
            break;
        case FT_2V:
            offset += 7 * (voice_subframe + 16);
            break;
        default:
            rc = false;
            break;
    }
    
	if (d_pr_type == PT_P25_PHASE1) {
		//FDMA
	    offset += (d_des_position * 11) + 11 + ((d_des_position < 8) ? 0 : 2); // voice only; skip 9 LCW bytes, 2 reserved bytes, and LSD between 7,8 and 16,17
        d_des_position = (d_des_position + 1) % 9;
        for (int j = 0; j < 11; ++j) {
            PCW[j] = des_ks[j + offset] ^ PCW[j];
        }

        //debug, print keystream values and track offset
        if (d_debug >= 10) {
            fprintf (stderr, "%s DES KS: ", logts.get(d_msgq_id));
            for (int j = 0; j < 7; ++j) {
                fprintf (stderr,  "%02X", des_ks[j + offset]);
            }
            fprintf (stderr, " Offset: %ld; \n", offset);
        }

	} else if (d_pr_type == PT_P25_PHASE2) {
        //TDMA - Experimental
        for (int j = 0; j < 7; ++j) {
            PCW[j] = des_ks[j + offset] ^ PCW[j];
        }
        PCW[6] &= 0x80; // mask everything except the MSB of the final codeword

        //debug, print keystream values and track offset
        if (d_debug >= 10) {
            fprintf (stderr, "%s DES KS: ", logts.get(d_msgq_id));
            for (int j = 0; j < 7; ++j) {
                fprintf (stderr,  "%02X", des_ks[j + offset]);
            }
            fprintf (stderr, " Offset: %ld; \n", offset);
        }
    }
    return rc;
}

// ADP RC4 helper routine to swap two bytes
void p25_crypt_algs::adp_swap(uint8_t *S, uint32_t i, uint32_t j) {
    uint8_t temp = S[i];
    S[i] = S[j];
    S[j] = temp;
}

// ADP RC4 create keystream using supplied key and message_indicator
void p25_crypt_algs::adp_keystream_gen() {
    uint8_t adp_key[13], S[256], K[256];
    uint32_t i, j, k;

    if (d_key_iter == d_keys.end())
        return;

    // Find key value from keyid and set up to create keystream
    std::vector<uint8_t>::const_iterator kval_iter = d_key_iter->second.key.begin();
    for (i = 0; i < (uint32_t)std::max(5-(int)(d_key_iter->second.key.size()), 0); i++) {
        adp_key[i] = 0;             // pad with leading 0 if supplied key too short 
    }
    for ( ; i < 5; i++) {
        adp_key[i] = *kval_iter++;  // copy up to 5 bytes into key array
    }

    j = 0;
    for (i = 5; i < 13; ++i) {
        adp_key[i] = d_mi[i - 5];   // append MI bytes
    }

    for (i = 0; i < 256; ++i) {
        K[i] = adp_key[i % 13];
    }

    for (i = 0; i < 256; ++i) {
        S[i] = i;
    }

    for (i = 0; i < 256; ++i) {
        j = (j + S[i] + K[i]) & 0xFF;
        adp_swap(S, i, j);
    }

    i = j = 0;

    for (k = 0; k < 469; ++k) {
        i = (i + 1) & 0xFF;
        j = (j + S[i]) & 0xFF;
        adp_swap(S, i, j);
        adp_keystream[k] = S[(S[i] + S[j]) & 0xFF];
    }
}


void p25_crypt_algs::des_keystream_gen() {
	std::string key, mi, ct;
	uint8_t des_key[8];
	uint32_t i;
	
	if (d_key_iter == d_keys.end())
		return;

	// Find key value from keyid and set up to create keystream
	std::vector<uint8_t>::const_iterator kval_iter = d_key_iter->second.key.begin();
	for (i = 0; i < (uint32_t)std::max(8 - (int)(d_key_iter->second.key.size()), 0); i++) {
		des_key[i] = 0;             // pad with leading 0 if supplied key too short 
	}
	for (; i < 8; i++) {
		des_key[i] = *kval_iter++;  // copy up to 8 bytes into key array
	}
	DES des;
	
	// Append supplied key array to string
	key = des.byteArray2string(des_key);

	// Append supplied MI to string 
	mi = des.byteArray2string(d_mi);

	// Key Generation, Hex to Binary
	key = des.hex2bin(key);

	// Parity bit drop table 
	int keyp[56] = { 57, 49, 41, 33, 25, 17, 9,
					1, 58, 50, 42, 34, 26, 18,
					10, 2, 59, 51, 43, 35, 27,
					19, 11, 3, 60, 52, 44, 36,
					63, 55, 47, 39, 31, 23, 15,
					7, 62, 54, 46, 38, 30, 22,
					14, 6, 61, 53, 45, 37, 29,
					21, 13, 5, 28, 20, 12, 4 };

	// getting 56 bit key from 64 bit using the parity bits 
	key = des.permute(key, keyp, 56); // key without parity 

	// Number of bit shifts 
	int shift_table[16] = { 1, 1, 2, 2,
							2, 2, 2, 2,
							1, 2, 2, 2,
							2, 2, 2, 1 };

	// Key-Compression Table 
	int key_comp[48] = { 14, 17, 11, 24, 1, 5,
						3, 28, 15, 6, 21, 10,
						23, 19, 12, 4, 26, 8,
						16, 7, 27, 20, 13, 2,
						41, 52, 31, 37, 47, 55,
						30, 40, 51, 45, 33, 48,
						44, 49, 39, 56, 34, 53,
						46, 42, 50, 36, 29, 32 };

	// Splitting 
	std::string left = key.substr(0, 28);
	std::string right = key.substr(28, 28);

	std::vector<std::string> rkb; // rkb for RoundKeys in binary 
	std::vector<std::string> rk; // rk for RoundKeys in hexadecimal 
	for (int i = 0; i < 16; i++) {
		// Shifting 
		left = des.shift_left(left, shift_table[i]);
		right = des.shift_left(right, shift_table[i]);

		// Combining 
		std::string combine = left + right;

		// Key Compression 
		std::string RoundKey = des.permute(combine, key_comp, 48);

		rkb.push_back(RoundKey);
		rk.push_back(des.bin2hex(RoundKey));
	}

    // OFB mode
    int offset = 0;
    for (int i = 0; i < 28; i++) {
        if (i == 0) {
            // First run using supplied IV
            ct = des.encrypt(mi, rkb, rk);
        } else {
            ct = des.encrypt(ct, rkb, rk);
        }

        // Append keystream to ks_array
        des.string2ByteArray(ct, des_ks, offset);

        // Increment offset by 8 for next round
        offset += 8;
    }
}

