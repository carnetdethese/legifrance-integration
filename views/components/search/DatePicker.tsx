export const DatePicker = ( { handleDateChange }: { handleDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;} ) => {
    return <>
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">
                    <label>Date de début</label>
                </div>
            </div>
            <div className="setting-item-control">
                    <input name="start-date" type="date" onChange={(e) => handleDateChange(e)} />
                </div>
        </div>
        <div className="setting-item">
        <div className="setting-item-info">
            <div className="setting-item-name">
                <label>Date de fin</label>
            </div>
        </div>
        <div className="setting-item-control">
                <input name="end-date" type="date" onChange={(e) => handleDateChange(e)} />
            </div>
    </div>
    </>
}
