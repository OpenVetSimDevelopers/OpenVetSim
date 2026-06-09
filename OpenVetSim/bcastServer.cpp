/*
 * bcastServer.cpp
 *
 * SimMgr applicatiopn
 *
 * This file is part of the sim-mgr distribution.
 *
 * Copyright (c) 2024 ITown Design LLC, Ithaca, NY
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
*/
#include "vetsim.h"

extern int closeFlag;

int bcastReply(void)
{
	WSADATA wsaData;
	auto sts = WSAStartup(MAKEWORD(2, 2), &wsaData);
	if (sts != 0)
	{
		printf("WSAStartup returns %d\n", sts);
		return (sts);
	}

	SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
	int broadcast = 1;
	if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, (const char*)&broadcast, sizeof(broadcast)) < 0)
	{
		std::cout << "Error in setting Broadcast option";
		closesocket(sock);
		WSACleanup();
		return (-1);
	}

	struct sockaddr_in Recv_addr;
	struct sockaddr_in Sender_addr;
	socklen_t len = sizeof(struct sockaddr_in);
	char recvbuff[50];
	int recvbufflen = 50;
	Recv_addr.sin_family = AF_INET;
	Recv_addr.sin_port = htons(PORT_STATUS);
	Recv_addr.sin_addr.s_addr = INADDR_ANY;
	auto ret = bind(sock, (sockaddr*)&Recv_addr, sizeof(Recv_addr));

	if (ret < 0)
	{
		std::cout << "Error in BINDING" << WSAGetLastError();
		closesocket(sock);
		WSACleanup();
		return (-1);
	}

	// Wake up every second so the loop can check closeFlag
#ifdef _WIN32
	DWORD recvTimeout = 1000;
	if (setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO,
		(const char*)&recvTimeout, sizeof(recvTimeout)) < 0)
	{
		std::cout << "Warning: SO_RCVTIMEO failed; shutdown may be delayed\n";
	}
#else
	struct timeval tv;
	tv.tv_sec = 1;
	tv.tv_usec = 0;
	setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
#endif

	do
	{
		std::cout << "\nWaiting for message...\n";
		memset(recvbuff, 0, sizeof(recvbuff));
		auto recv_sts = recvfrom(sock, recvbuff, recvbufflen, 0, (sockaddr*)&Sender_addr, &len);
		if (recv_sts != SOCKET_ERROR)
		{
			std::cout << "Received Message is: " << recvbuff;
			if (strcmp("WVS_LOOK", recvbuff) == 0)
			{
				inet_ntop(AF_INET, &(Sender_addr.sin_addr), recvbuff, INET_ADDRSTRLEN);
				std::cout << " From " << recvbuff;
				snprintf(recvbuff, sizeof(recvbuff), "%s", "WVS_FOUND");
				ret = sendto(sock, recvbuff, (int)strlen(recvbuff), 0, (struct sockaddr*)&Sender_addr, len);
			}
		}
	} while (!closeFlag);

	closesocket(sock);
	WSACleanup();
	return (0);
}