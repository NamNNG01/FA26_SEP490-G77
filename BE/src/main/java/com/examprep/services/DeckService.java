package com.examprep.services;

import com.examprep.dto.CardResponse;
import com.examprep.dto.DeckRequests;
import com.examprep.dto.DeckResponse;
import com.examprep.dto.PageResponse;
import com.examprep.security.UserPrincipal;

public interface DeckService {
    PageResponse<DeckResponse> list(UserPrincipal user, String search, Long courseId, Boolean isPublic, int page, int size);
    DeckResponse detail(UserPrincipal user, Long id);
    DeckResponse create(UserPrincipal user, DeckRequests.Create request);
    DeckResponse update(UserPrincipal user, Long id, DeckRequests.Update request);
    void delete(UserPrincipal user, Long id);

    /** F-06: append a card; access is derived from the deck. */
    CardResponse addCard(UserPrincipal user, Long id, DeckRequests.CardCreate request);

    /** F-07: partial card update; access is derived from the card's deck. */
    CardResponse updateCard(UserPrincipal user, Long id, DeckRequests.CardUpdate request);
}
